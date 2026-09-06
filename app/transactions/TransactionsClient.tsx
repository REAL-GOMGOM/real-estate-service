'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TxErrorState, TxEmptyState } from '@/components/shared/TxStates';
import { AnalysisPromoBar } from '@/components/shared/AnalysisPromoBar';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { matchesQuery } from '@/lib/search-utils';
import { matchesApartmentIdentity } from '@/lib/transaction-identity';
import { txKey } from '@/lib/tx-share-text';
import { rentTxKey } from '@/lib/rent-share-text';
import { trackAnalyticsEvent } from '@/lib/cookie-consent';
import Header from '@/components/layout/Header';
import { AptAutocomplete, type ApartmentSearchResult } from '@/components/search/AptAutocomplete';
import { type AptGroup, type DistrictStat, detectNewHigh } from './types';
import { sortRentGroups, type RentAptGroup, type RentSortKey } from '@/lib/rent-shared';
import AptCard from './components/AptCard';
import RentAptCard from './components/RentAptCard';
import CoupangBanner from '@/components/ads/CoupangBanner';
import RentAptDetailModal from './components/RentAptDetailModal';
import AptDetailModal from './components/AptDetailModal';
import RegionPickerModal from './components/RegionPickerModal';
import DistrictChips from './components/DistrictChips';
import GlobalApartmentSearchResults from './components/GlobalApartmentSearchResults';
import DataFreshness from './components/DataFreshness';
import { readTransactionFreshness, type TransactionFreshness, type TransactionFreshnessResult } from '@/lib/transaction-freshness';
import { kstTodayIso } from '@/lib/agg-window';

/**
 * 실거래 조회 클라이언트 — 사이클 W (아실형 개편)
 *
 * summary(시도 카드) → 구 선택 모달 → detail(구 칩 + 아실형 단지 카드).
 * 정렬(거래량·최신·가격) + 신고가만 + 면적 필터.
 */

function findGroupIndexOfDistrict(district: string): number {
  return DISTRICT_GROUPS.findIndex((g) => g.districts.includes(district));
}

function groupMatchesSelectedApartment(
  group: { name: string; dong?: string | null; masterId?: string | null },
  apartment: ApartmentSearchResult,
): boolean {
  return matchesApartmentIdentity(
    { aptName: group.name, dong: group.dong, masterId: group.masterId },
    { id: apartment.id, name: apartment.name, dong: apartment.dong },
  );
}

type SortKey = 'volume' | 'date' | 'price';

/** 거래 유형 탭 — 사이클 II (전세·월세), 분양권 추가 */
type DealType = 'buy' | 'jeonse' | 'monthly' | 'bunyang';

interface TransactionResultCache<T> {
  requestKey: string;
  groups: T[];
  partial?: boolean;
  freshness: TransactionFreshness | null;
}

function apartmentQueryString(aptId: string | null | undefined, name: string, dong: string | null) {
  const params = new URLSearchParams();
  if (aptId) params.set('aptId', aptId);
  else if (name.trim()) {
    params.set('aptName', name.trim());
    if (dong) params.set('aptDong', dong);
  }
  return params.toString();
}

function transactionRequestKey(district: string, months: number, type: DealType, apartmentQuery: string) {
  return JSON.stringify([district, months, type, apartmentQuery]);
}

const DEAL_TYPE_TABS: { key: DealType; label: string }[] = [
  { key: 'buy',     label: '매매' },
  { key: 'jeonse',  label: '전세' },
  { key: 'monthly', label: '월세' },
  { key: 'bunyang', label: '분양권' },
];

interface SummaryRegion {
  label:          string;
  estimatedCount: number;
  newHighs:       number;
  avg59:          number | null;  // 매매=평균 거래가, 전월세=평균 보증금 (만원)
  avg84:          number | null;
  avgRent59?:     number | null;  // 월세 탭 전용 — 평균 월세 (만원)
  avgRent84?:     number | null;
  firstDistrict:  string;
  todayCount?:    number;   // 봇 공개분 (있으면 오늘 공개 기준 표시)
  todayNewHighs?: number;
}

interface DailyMeta { date: string; totalCount: number; totalNewHighs: number }

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'volume', label: '거래많은순' },
  { key: 'date',   label: '최신순' },
  { key: 'price',  label: '높은가격순' },
];

const AREA_OPTIONS: { key: string; label: string }[] = [
  { key: 'all', label: '전체 면적' },
  { key: '59',  label: '59㎡' },
  { key: '84',  label: '84㎡' },
];

const VALID_MONTHS = [2, 3, 6, 12, 24, 36] as const;

function isValidMonths(value: number): value is (typeof VALID_MONTHS)[number] {
  return VALID_MONTHS.some((candidate) => candidate === value);
}

function dealTypeFromParam(value: string | null): DealType {
  return value === 'jeonse' || value === 'monthly' || value === 'bunyang'
    ? value
    : 'buy';
}

function applyDealTypeParam(params: URLSearchParams, value: DealType): void {
  if (value === 'buy') params.delete('dealType');
  else params.set('dealType', value);
}

function clearApartmentParams(params: URLSearchParams): void {
  params.delete('q');
  params.delete('aptId');
  params.delete('aptDong');
  params.delete('tx');
  params.delete('rtx');
}

// 전월세 정렬 (전월세 v2) — monthlyOnly 는 월세 탭에서만 노출
const RENT_SORT_OPTIONS: { key: RentSortKey; label: string; monthlyOnly?: boolean }[] = [
  { key: 'volume',  label: '거래많은순' },
  { key: 'date',    label: '최신순' },
  { key: 'deposit', label: '보증금높은순' },
  { key: 'monthly', label: '월세높은순', monthlyOnly: true },
];

export default function TransactionsClient() {
  const router = useRouter();
  const searchParams  = useSearchParams();
  const districtParam = searchParams.get('district');
  const queryParam    = searchParams.get('q');
  const aptIdParam    = searchParams.get('aptId');
  const aptDongParam  = searchParams.get('aptDong');
  // 계약 건 딥링크 (공유 강화 2026-07-19) — tx 식별자 + 공유 시점의 조회 기간
  const txParam       = searchParams.get('tx');
  const rtxParam      = searchParams.get('rtx');       // 전월세 계약 건 (전월세 대칭)
  const dealTypeParam = searchParams.get('dealType');  // 탭 복원 (jeonse|monthly|bunyang)
  const monthsParam   = parseInt(searchParams.get('months') ?? '', 10);
  const initialParamsString = searchParams.toString();
  // router.replace가 화면에 반영되기 전의 연속 입력도 직전 URL 변경 위에 합성한다.
  const latestParamsRef = useRef(initialParamsString);
  const observedParamsRef = useRef(initialParamsString);
  const pendingParamsRef = useRef<string | null>(null);

  useEffect(() => {
    const observed = searchParams.toString();
    if (observed === observedParamsRef.current) return;
    observedParamsRef.current = observed;

    if (pendingParamsRef.current && observed !== pendingParamsRef.current) return;
    latestParamsRef.current = observed;
    pendingParamsRef.current = null;
  }, [searchParams]);

  const [today, setToday] = useState(new Date(0));
  useEffect(() => { setToday(new Date()); }, []);

  const [district,  setDistrict]  = useState(districtParam || '강남구');
  const [groupIdx,  setGroupIdx]  = useState(() => Math.max(0, findGroupIndexOfDistrict(districtParam || '강남구')));
  // 딥링크의 months 를 복원해야 공유된 계약 건이 조회 범위에 들어온다
  const [months,    setMonths]    = useState<number>(
    isValidMonths(monthsParam) ? monthsParam : 2,
  );
  const [query,     setQuery]     = useState(queryParam ?? '');
  const [groups,    setGroups]    = useState<AptGroup[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fetched,   setFetched]   = useState('');
  const [activeApt, setActiveApt] = useState<AptGroup | null>(null);
  // 자동완성에서 정확히 고른 단지 — 있으면 퍼지 매칭 대신 이 단지만 정확 표시
  const [selectedApt, setSelectedApt] = useState<ApartmentSearchResult | null>(() =>
    aptIdParam && queryParam
      ? {
          id: aptIdParam,
          name: queryParam,
          sido: '',
          sigungu: districtParam ?? '',
          dong: aptDongParam,
          lawdCd: '',
        }
      : null,
  );
  const buyAbortRef = useRef<AbortController | null>(null);
  // Restore records, status and provenance atomically when returning from a
  // different query that is still pending or failed. A fetched key alone is not a cache.
  const buyCacheRef = useRef<TransactionResultCache<AptGroup> | null>(null);
  const rentCacheRef = useRef<TransactionResultCache<RentAptGroup> | null>(null);
  const silvCacheRef = useRef<TransactionResultCache<AptGroup> | null>(null);

  const [viewMode, setViewMode] = useState<'summary' | 'detail'>(districtParam ? 'detail' : 'summary');

  // 거래 유형 (사이클 II) — 전월세는 별도 데이터·카드 경로
  // 딥링크의 dealType 을 복원해야 전월세 공유가 해당 탭으로 착지한다
  const [dealType, setDealType] = useState<DealType>(
    dealTypeFromParam(dealTypeParam),
  );
  const [rentGroups,  setRentGroups]  = useState<RentAptGroup[]>([]);
  const [rentLoading, setRentLoading] = useState(false);
  const [rentError,   setRentError]   = useState(false);
  const [rentPartial, setRentPartial] = useState(false);
  const [rentFetched, setRentFetched] = useState('');
  const [rentRetryKey, setRentRetryKey] = useState(0);
  const [rentSortKey, setRentSortKey] = useState<RentSortKey>('volume');
  const [activeRent,  setActiveRent]  = useState<RentAptGroup | null>(null);
  // 분양권 (silv) — 매매와 동일 AptGroup 이라 카드·모달 재사용
  const [silvGroups,  setSilvGroups]  = useState<AptGroup[]>([]);
  const [silvLoading, setSilvLoading] = useState(false);
  const [silvError,   setSilvError]   = useState(false);
  const [silvPartial, setSilvPartial] = useState(false);
  const [silvFetched, setSilvFetched] = useState('');
  const [silvRetryKey, setSilvRetryKey] = useState(0);
  const [summaryData, setSummaryData] = useState<SummaryRegion[]>([]);
  const [dailyMeta, setDailyMeta] = useState<DailyMeta | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryRetryKey, setSummaryRetryKey] = useState(0);
  // 집계 윈도우 (2026-08-02 월초 공백 해소) — 'today'(봇 공개분) | 'rolling30' | 'YYYYMM'
  const [sumWindow, setSumWindow] = useState<string>('today');
  const [detailFreshness, setDetailFreshness] = useState<Partial<Record<DealType, TransactionFreshnessResult>>>({});
  const [summaryFreshness, setSummaryFreshness] = useState<TransactionFreshnessResult>();

  // 구 선택 모달 (아실형) — 열려 있으면 해당 시도 그룹
  const [picker, setPicker] = useState<{ label: string; districts: string[] } | null>(null);

  // 구별 칩 통계 — 그룹 단위 캐시
  const [districtStats, setDistrictStats] = useState<Record<string, DistrictStat[]>>({});

  // 정렬·필터
  const [sortKey,     setSortKey]     = useState<SortKey>('volume');
  const [newHighOnly, setNewHighOnly] = useState(false);
  const [areaFilter,  setAreaFilter]  = useState('all');

  // URL을 공유·새로고침 가능한 단일 진실로 사용한다.
  useEffect(() => {
    setMonths(isValidMonths(monthsParam) ? monthsParam : 2);
    setDealType(dealTypeFromParam(dealTypeParam));
    setQuery(queryParam ?? '');
    if (districtParam) {
      setDistrict(districtParam);
      setGroupIdx(Math.max(0, findGroupIndexOfDistrict(districtParam)));
      setSelectedApt(
        aptIdParam && queryParam
          ? {
              id: aptIdParam,
              name: queryParam,
              sido: '',
              sigungu: districtParam,
              dong: aptDongParam,
              lawdCd: '',
            }
          : null,
      );
      setViewMode('detail');
    } else {
      setSelectedApt(null);
      setViewMode('summary');
    }
  }, [districtParam, queryParam, aptIdParam, aptDongParam, monthsParam, dealTypeParam]);

  // URL이 바뀐 첫 렌더에는 이전 요청의 groups가 남아 있을 수 있다.
  // 성공한 응답의 요청 키가 URL과 일치할 때만 공유 계약을 연다.
  const urlRequestKey = transactionRequestKey(
    districtParam ?? '강남구',
    isValidMonths(monthsParam) ? monthsParam : 2,
    dealTypeFromParam(dealTypeParam),
    apartmentQueryString(aptIdParam && queryParam ? aptIdParam : null, queryParam ?? '', aptDongParam),
  );
  const routeSelectionKey = JSON.stringify([urlRequestKey, queryParam, aptDongParam, txParam, rtxParam]);
  const autoOpenedRef = useRef('');
  const rentAutoOpenedRef = useRef('');
  useEffect(() => {
    setActiveApt(null);
    setActiveRent(null);
    autoOpenedRef.current = '';
    rentAutoOpenedRef.current = '';
  }, [routeSelectionKey]);

  // 계약 건 딥링크 — 같은 단지의 별칭 그룹 중 실제 공유 계약이 있는 그룹 우선.
  useEffect(() => {
    if ((dealType !== 'buy' && dealType !== 'bunyang') || !txParam || !queryParam) return;
    if ((dealType === 'bunyang' ? silvFetched : fetched) !== urlRequestKey) return;
    const key = routeSelectionKey;
    if (autoOpenedRef.current === key || (dealType === 'bunyang' ? silvLoading : loading)) return;
    const candidates = dealType === 'bunyang' ? silvGroups : groups;
    if (candidates.length === 0) return;
    const q = queryParam.trim();
    const exact = aptIdParam ? candidates.filter((g) => g.masterId === aptIdParam) : candidates.filter(
      (g) => g.name === q && (!aptDongParam || g.dong === aptDongParam),
    );
    const matching = aptIdParam || exact.length > 0 ? exact : candidates.filter(
      (g) => matchesQuery(g.name, q) && (!aptDongParam || g.dong === aptDongParam),
    );
    const target = matching.find((g) => g.transactions.some((transaction) => txKey(transaction) === txParam)) ?? matching[0];
    if (target) {
      setActiveApt(target);
      autoOpenedRef.current = key;
    }
  }, [groups, silvGroups, loading, silvLoading, fetched, silvFetched, urlRequestKey, routeSelectionKey, dealType, txParam, queryParam, aptIdParam, aptDongParam]);

  // 전월세 계약 건 딥링크 (전월세 대칭 2026-07-19) — rentGroups 로드 후 자동 오픈 (1회)
  useEffect(() => {
    if ((dealType !== 'jeonse' && dealType !== 'monthly') || !rtxParam || !queryParam || rentLoading) return;
    if (rentFetched !== urlRequestKey) return;
    const key = routeSelectionKey;
    if (rentAutoOpenedRef.current === key) return;
    if (rentGroups.length === 0) return;
    const q = queryParam.trim();
    const exact = aptIdParam ? rentGroups.filter((g) => g.masterId === aptIdParam) : rentGroups.filter(
      (g) => g.name === q && (!aptDongParam || g.dong === aptDongParam),
    );
    const matching = aptIdParam || exact.length > 0 ? exact : rentGroups.filter(
      (g) => matchesQuery(g.name, q) && (!aptDongParam || g.dong === aptDongParam),
    );
    const target = matching.find((g) => g.transactions.some((transaction) => rentTxKey(transaction) === rtxParam)) ?? matching[0];
    if (target) {
      setActiveRent(target);
      rentAutoOpenedRef.current = key;
    }
  }, [rentGroups, rentLoading, rentFetched, urlRequestKey, routeSelectionKey, dealType, rtxParam, queryParam, aptIdParam, aptDongParam]);

  // 목록을 잘라 받은 뒤 검색하면 거래가 적은 단지가 누락된다.
  // 정확 단지 ID 또는 기존 공유 링크의 이름·동을 모든 거래 API에 전달한다.
  const apartmentRequestQuery = useMemo(
    () => apartmentQueryString(selectedApt?.id, query, aptDongParam),
    [selectedApt?.id, query, aptDongParam],
  );
  const activeDetailRequestKey = transactionRequestKey(district, months, dealType, apartmentRequestQuery);

  const load = useCallback(async (
    d: string,
    m: number,
    apartmentQuery = '',
    force = false,
  ) => {
    const key = transactionRequestKey(d, m, 'buy', apartmentQuery);
    buyAbortRef.current?.abort();
    const cached = buyCacheRef.current;
    if (!force && cached?.requestKey === key) {
      buyAbortRef.current = null;
      setGroups(cached.groups);
      setFetched(key);
      setLoading(false);
      setError(null);
      setDetailFreshness((previous) => ({ ...previous, buy: {
        requestKey: key, status: 'ready', value: cached.freshness,
      } }));
      return;
    }
    const controller = new AbortController();
    buyAbortRef.current = controller;
    setLoading(true);
    setError(null);
    setDetailFreshness((previous) => ({ ...previous, buy: { requestKey: key, status: 'loading' } }));
    try {
      const params = new URLSearchParams({ months: String(m) });
      const selection = new URLSearchParams(apartmentQuery);
      if (!selection.has('aptId')) params.set('district', d);
      selection.forEach((value, name) => params.set(name, value));
      const res  = await fetch(`/api/transactions?${params.toString()}`, {
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok || json.error || !Array.isArray(json.data)) {
        throw new Error(json.error || 'transactions unavailable');
      }
      if (buyAbortRef.current !== controller) return;
      const freshness = readTransactionFreshness(res.headers);
      buyCacheRef.current = { requestKey: key, groups: json.data, freshness };
      setGroups(json.data);
      setFetched(key);
      setDetailFreshness((previous) => ({ ...previous, buy: {
        requestKey: key, status: 'ready', value: freshness,
      } }));
    } catch (loadError: unknown) {
      if ((loadError as { name?: string }).name === 'AbortError') return;
      if (buyAbortRef.current !== controller) return;
      setGroups([]);
      setError('데이터 조회에 실패했습니다');
      setDetailFreshness((previous) => ({ ...previous, buy: { requestKey: key, status: 'error' } }));
    } finally {
      if (buyAbortRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'detail' && dealType === 'buy') {
      load(district, months, apartmentRequestQuery);
    }
  }, [district, months, viewMode, dealType, apartmentRequestQuery, load]);

  useEffect(() => () => buyAbortRef.current?.abort(), []);

  // 전월세 조회 (사이클 II) — 매매 캐시(fetched)와 별개 키
  useEffect(() => {
    if (
      viewMode !== 'detail' ||
      (dealType !== 'jeonse' && dealType !== 'monthly')
    ) return;
    const key = transactionRequestKey(district, months, dealType, apartmentRequestQuery);
    const cached = rentCacheRef.current;
    if (cached?.requestKey === key) {
      setRentGroups(cached.groups);
      setRentPartial(cached.partial ?? false);
      setRentFetched(key);
      setRentLoading(false);
      setRentError(false);
      setDetailFreshness((previous) => ({ ...previous, [dealType]: {
        requestKey: key, status: 'ready', value: cached.freshness,
      } }));
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setRentLoading(true);
    setRentError(false);
    setRentPartial(false);
    setDetailFreshness((previous) => ({ ...previous, [dealType]: { requestKey: key, status: 'loading' } }));
    const params = new URLSearchParams({ district, months: String(months), rentType: dealType });
    new URLSearchParams(apartmentRequestQuery).forEach((value, name) => params.set(name, value));
    fetch(`/api/transactions/rent?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || json.error || !Array.isArray(json.data)) {
          throw new Error(json.error || 'rent transactions unavailable');
        }
        return { json, freshness: readTransactionFreshness(response.headers) };
      })
      .then(({ json, freshness }) => {
        if (cancelled) return;
        rentCacheRef.current = { requestKey: key, groups: json.data, partial: json.status === 'partial', freshness };
        setRentGroups(json.data);
        setRentPartial(json.status === 'partial');
        setRentFetched(key);
        setRentLoading(false);
        setDetailFreshness((previous) => ({ ...previous, [dealType]: {
          requestKey: key, status: 'ready', value: freshness,
        } }));
      })
      .catch((loadError: unknown) => {
        if (cancelled || (loadError as { name?: string }).name === 'AbortError') return;
        setRentGroups([]);
        setRentPartial(false);
        setRentError(true);
        setRentLoading(false);
        setDetailFreshness((previous) => ({ ...previous, [dealType]: { requestKey: key, status: 'error' } }));
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewMode, dealType, district, months, apartmentRequestQuery, rentRetryKey]);

  // 분양권 조회 — 매매/전월세와 별개 키 (silv 라우트)
  useEffect(() => {
    if (viewMode !== 'detail' || dealType !== 'bunyang') return;
    const key = transactionRequestKey(district, months, 'bunyang', apartmentRequestQuery);
    const cached = silvCacheRef.current;
    if (cached?.requestKey === key) {
      setSilvGroups(cached.groups);
      setSilvPartial(cached.partial ?? false);
      setSilvFetched(key);
      setSilvLoading(false);
      setSilvError(false);
      setDetailFreshness((previous) => ({ ...previous, bunyang: {
        requestKey: key, status: 'ready', value: cached.freshness,
      } }));
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSilvLoading(true);
    setSilvError(false);
    setSilvPartial(false);
    setDetailFreshness((previous) => ({ ...previous, bunyang: { requestKey: key, status: 'loading' } }));
    const params = new URLSearchParams({ district, months: String(months) });
    new URLSearchParams(apartmentRequestQuery).forEach((value, name) => params.set(name, value));
    fetch(`/api/transactions/silv?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || json.error || !Array.isArray(json.data)) {
          throw new Error(json.error || 'presale transactions unavailable');
        }
        return { json, freshness: readTransactionFreshness(response.headers) };
      })
      .then(({ json, freshness }) => {
        if (cancelled) return;
        silvCacheRef.current = { requestKey: key, groups: json.data, partial: json.status === 'partial', freshness };
        setSilvGroups(json.data);
        setSilvPartial(json.status === 'partial');
        setSilvFetched(key);
        setSilvLoading(false);
        setDetailFreshness((previous) => ({ ...previous, bunyang: {
          requestKey: key, status: 'ready', value: freshness,
        } }));
      })
      .catch((loadError: unknown) => {
        if (cancelled || (loadError as { name?: string }).name === 'AbortError') return;
        setSilvGroups([]);
        setSilvPartial(false);
        setSilvError(true);
        setSilvLoading(false);
        setDetailFreshness((previous) => ({ ...previous, bunyang: { requestKey: key, status: 'error' } }));
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [viewMode, dealType, district, months, apartmentRequestQuery, silvRetryKey]);

  // 시도별 요약 — 윈도우·유형 선택 반영.
  // 'today'와 'rolling30'은 같은 서버 기본(최근 30일) 응답을 공유하므로
  // 파생 키(sumFetchKey)로 묶어 탭 전환 시 중복 페치를 막는다.
  // 유형별 집계: 전세·월세=rent 원장, 분양권=silv 원장 (2026-08-02 신설).
  const sumFetchKey = /^\d{6}$/.test(sumWindow) ? sumWindow : 'default';
  const sumDealType: DealType = dealType;
  const summaryRequestKey = JSON.stringify([sumFetchKey, sumDealType]);
  useEffect(() => {
    if (viewMode !== 'summary') return;
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryFreshness({ requestKey: summaryRequestKey, status: 'loading' });
    const params = new URLSearchParams();
    if (sumFetchKey !== 'default') params.set('window', sumFetchKey);
    if (sumDealType !== 'buy') params.set('dealType', sumDealType);
    const qs = params.toString();
    fetch(`/api/transactions/summary${qs ? `?${qs}` : ''}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const json = await response.json();
        if (
          !response.ok ||
          json.status === 'degraded' ||
          !Array.isArray(json.summary) ||
          json.summary.length === 0
        ) {
          throw new Error(json.note || json.error || 'summary unavailable');
        }
        return { json, freshness: readTransactionFreshness(response.headers, { aggregateUpdatedAt: json.updatedAt }) };
      })
      .then(({ json, freshness }) => {
        if (controller.signal.aborted) return;
        setSummaryData(json.summary);
        setDailyMeta(json.daily ?? null);
        setSummaryFreshness({ requestKey: summaryRequestKey, status: 'ready', value: freshness });
        // 봇 공개분이 없는 날(또는 전월세 탭)은 '오늘 공개' 탭 무의미 — 최근 30일로 자동 전환
        if (!json.daily) setSumWindow((w) => (w === 'today' ? 'rolling30' : w));
        setSummaryLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error as { name?: string }).name === 'AbortError') return;
        setSummaryData([]);
        setDailyMeta(null);
        setSummaryError('집계 데이터를 불러오지 못했습니다');
        setSummaryLoading(false);
        setSummaryFreshness({ requestKey: summaryRequestKey, status: 'error' });
      });
    return () => controller.abort();
  }, [viewMode, sumFetchKey, sumDealType, summaryRetryKey, summaryRequestKey]);

  // 월 탭 옵션에만 현재 달력을 사용한다. 데이터 기준 시각과는 별개다.
  const windowMonths = useMemo(() => {
    if (today.getFullYear() < 2001) return [];
    const kst = new Date(`${kstTodayIso(today)}T00:00:00Z`);
    const cur = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1));
    const prev = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
    const key = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return [
      { key: key(cur),  label: `${cur.getUTCMonth() + 1}월` },
      { key: key(prev), label: `${prev.getUTCMonth() + 1}월` },
    ];
  }, [today]);
  const dailyIsToday = dailyMeta?.date === kstTodayIso(today);

  // 구별 칩 통계 — detail 진입 시 그룹 단위로 1회 조회
  const groupLabel = DISTRICT_GROUPS[groupIdx]?.label ?? '';
  useEffect(() => {
    if (viewMode !== 'detail' || !groupLabel || districtStats[groupLabel]) return;
    fetch(`/api/transactions/districts?group=${encodeURIComponent(groupLabel)}`)
      .then(r => r.json())
      .then(json => {
        if (Array.isArray(json.districts)) {
          setDistrictStats(prev => ({ ...prev, [groupLabel]: json.districts }));
        }
      })
      .catch(() => { /* 칩은 구명만으로 폴백 렌더 */ });
  }, [viewMode, groupLabel, districtStats]);

  // 검색·필터·정렬 파이프라인
  const filtered = useMemo(() => {
    let list: AptGroup[];
    if (selectedApt) {
      // 자동완성에서 고른 단지 ID를 API까지 전달하고 동일 마스터만 표시한다.
      list = groups.filter((g) => groupMatchesSelectedApartment(g, selectedApt));
    } else if (query.trim()) {
      list = groups.filter(
        (g) => matchesQuery(g.name, query.trim()) && (!aptDongParam || g.dong === aptDongParam),
      );
    } else {
      list = groups;
    }

    if (newHighOnly) list = list.filter(detectNewHigh);

    if (areaFilter !== 'all') {
      const target = parseInt(areaFilter);
      list = list.filter((g) => g.areas.some((a) => Math.abs(a - target) <= 4));
    }

    const latestOf = (g: AptGroup) =>
      g.transactions.reduce((m, t) => (t.date > m ? t.date : m), '');
    const latestPriceOf = (g: AptGroup) => {
      const sorted = [...g.transactions].sort((a, b) => b.date.localeCompare(a.date));
      return sorted[0]?.price ?? 0;
    };

    return [...list].sort((a, b) => {
      if (sortKey === 'date')  return latestOf(b).localeCompare(latestOf(a));
      if (sortKey === 'price') return latestPriceOf(b) - latestPriceOf(a);
      return b.transactions.length - a.transactions.length;
    });
  }, [groups, query, selectedApt, aptDongParam, newHighOnly, areaFilter, sortKey]);

  const totalTx    = filtered.reduce((s, g) => s + g.transactions.length, 0);
  const newHighCnt = filtered.filter(detectNewHigh).length;

  // 전월세 파생값 (전월세 v2 — 월세 정렬): 검색 필터 → 정렬. 총 건수는 서버 원본 건수(txCount) 합
  const rentFiltered = selectedApt
    ? rentGroups.filter((group) => groupMatchesSelectedApartment(group, selectedApt))
    : query.trim()
      ? rentGroups.filter((g) => matchesQuery(g.name, query.trim()))
        .filter((g) => !aptDongParam || g.dong === aptDongParam)
      : rentGroups;
  const rentSorted   = sortRentGroups(rentFiltered, rentSortKey);
  const rentTotalTx  = rentFiltered.reduce((s, g) => s + (g.txCount ?? g.transactions.length), 0);

  const silvVisibleGroups = useMemo(() => {
    if (selectedApt) {
      return silvGroups.filter((group) => groupMatchesSelectedApartment(group, selectedApt));
    }
    if (query.trim()) {
      return silvGroups
        .filter((group) => matchesQuery(group.name, query.trim()))
        .filter((group) => !aptDongParam || group.dong === aptDongParam);
    }
    return silvGroups;
  }, [aptDongParam, query, selectedApt, silvGroups]);

  const replaceParams = useCallback((params: URLSearchParams) => {
    const nextQuery = params.toString();
    latestParamsRef.current = nextQuery;
    pendingParamsRef.current = nextQuery === observedParamsRef.current ? null : nextQuery;
    router.replace(nextQuery ? `/transactions?${nextQuery}` : '/transactions', { scroll: false });
  }, [router]);

  const enterDistrict = useCallback((d: string) => {
    setGroupIdx(Math.max(0, findGroupIndexOfDistrict(d)));
    setDistrict(d);
    setSelectedApt(null);   // 지역 바꾸면 이전 단지 선택·검색 초기화
    setQuery('');
    setViewMode('detail');
    setPicker(null);
    setActiveApt(null);
    setActiveRent(null);

    const params = new URLSearchParams(latestParamsRef.current);
    clearApartmentParams(params);
    params.set('district', d);
    params.set('months', String(months));
    applyDealTypeParam(params, dealType);
    replaceParams(params);
  }, [dealType, months, replaceParams]);

  const showSummary = useCallback(() => {
    setViewMode('summary');
    setSelectedApt(null);
    setQuery('');
    setActiveApt(null);
    setActiveRent(null);

    const params = new URLSearchParams(latestParamsRef.current);
    clearApartmentParams(params);
    params.delete('district');
    params.set('months', String(months));
    applyDealTypeParam(params, dealType);
    replaceParams(params);
  }, [dealType, months, replaceParams]);

  const changeDealType = useCallback((nextDealType: DealType) => {
    setDealType(nextDealType);
    if (nextDealType !== 'monthly' && rentSortKey === 'monthly') setRentSortKey('volume');
    setActiveApt(null);
    setActiveRent(null);

    const params = new URLSearchParams(latestParamsRef.current);
    applyDealTypeParam(params, nextDealType);
    params.delete('tx');
    params.delete('rtx');
    replaceParams(params);
  }, [rentSortKey, replaceParams]);

  const changeMonths = useCallback((nextMonths: number) => {
    setMonths(nextMonths);
    setActiveApt(null);
    setActiveRent(null);

    const params = new URLSearchParams(latestParamsRef.current);
    params.set('months', String(nextMonths));
    params.delete('tx');
    params.delete('rtx');
    replaceParams(params);
  }, [replaceParams]);

  const apartmentHref = useCallback((apartment: ApartmentSearchResult) => {
    const districtLabel = findDistrictByLawdCd(apartment.lawdCd) ?? apartment.sigungu;
    const params = new URLSearchParams(latestParamsRef.current);
    params.set('district', districtLabel);
    params.set('q', apartment.name);
    params.set('aptId', apartment.id);
    params.set('months', String(months));
    if (apartment.dong) params.set('aptDong', apartment.dong);
    else params.delete('aptDong');
    applyDealTypeParam(params, dealType);
    params.delete('tx');
    params.delete('rtx');
    return `/transactions?${params.toString()}`;
  }, [dealType, months]);

  const selectApartment = useCallback((apartment: ApartmentSearchResult) => {
    const districtLabel = findDistrictByLawdCd(apartment.lawdCd) ?? apartment.sigungu;
    const matched = findGroupIndexOfDistrict(districtLabel);
    if (matched >= 0) setGroupIdx(matched);
    setDistrict(districtLabel);
    setSelectedApt(apartment);
    setQuery(apartment.name);
    setViewMode('detail');
    setPicker(null);
    setActiveApt(null);
    setActiveRent(null);
    trackAnalyticsEvent('transaction_apartment_search_select', {
      apartment_id: apartment.id,
      district: districtLabel,
      source: 'transactions_top',
    });
    router.replace(apartmentHref(apartment), { scroll: false });
  }, [apartmentHref, router]);

  const clearApartmentSearch = useCallback(() => {
    setSelectedApt(null);
    setQuery('');
    setActiveApt(null);
    setActiveRent(null);

    const params = new URLSearchParams(latestParamsRef.current);
    clearApartmentParams(params);
    if (viewMode === 'detail') params.set('district', district);
    else params.delete('district');
    params.set('months', String(months));
    applyDealTypeParam(params, dealType);
    replaceParams(params);
  }, [dealType, district, months, replaceParams, viewMode]);

  const resetDetailFilters = useCallback(() => {
    setSelectedApt(null);
    setQuery('');
    setNewHighOnly(false);
    setAreaFilter('all');
    setMonths(6);
    setActiveApt(null);
    setActiveRent(null);

    const params = new URLSearchParams(latestParamsRef.current);
    clearApartmentParams(params);
    params.set('district', district);
    params.set('months', '6');
    applyDealTypeParam(params, dealType);
    replaceParams(params);
  }, [dealType, district, replaceParams]);

  return (
    <>
    <Header />
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px' }}>

        {/* 헤더 — 11a 타이틀 밴드 (summary) / 간결 헤더 (detail) */}
        {viewMode === 'summary' ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                backgroundColor: '#FDECEC', color: '#E23B3B',
                fontWeight: 700, fontSize: '12px', padding: '5px 11px',
                borderRadius: '99px', marginBottom: '12px',
              }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E23B3B', display: 'inline-block' }} />
                {sumWindow === 'today' && dailyMeta
                  ? (dailyIsToday ? '오늘 아침 공개' : `${dailyMeta.date} 공개분`)
                  : /^\d{6}$/.test(sumWindow)
                    ? `${parseInt(sumWindow.slice(4, 6), 10)}월 신고 집계`
                    : '최근 30일 신고 집계'}
              </div>
              <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(22px, 3vw, 29px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.6px' }}>
                {sumWindow === 'today' && dailyMeta
                  ? (dailyIsToday ? '오늘 공개된 최신 실거래' : '최근 공개된 실거래')
                  : /^\d{6}$/.test(sumWindow)
                    ? `${parseInt(sumWindow.slice(4, 6), 10)}월 실거래`
                    : '최근 30일 실거래'}
              </h1>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                <DataFreshness result={summaryFreshness} requestKey={dealType === dealTypeFromParam(dealTypeParam) ? summaryRequestKey : ''} />
                {' · 국토교통부 실거래가 공개시스템 기준'}
              </p>
            </div>
            {!summaryLoading && summaryData.length > 0 && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>총</span>
                  <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
                    {(sumWindow === 'today' && dailyMeta ? dailyMeta.totalCount : summaryData.reduce((s, r) => s + r.estimatedCount, 0)).toLocaleString()}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)' }}>건</span>
                </div>
                {sumDealType === 'buy' || sumDealType === 'bunyang' ? (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#E23B3B', marginTop: '2px' }}>
                    신고가 {sumWindow === 'today' && dailyMeta ? dailyMeta.totalNewHighs : summaryData.reduce((s, r) => s + r.newHighs, 0)}건 🔥
                    {sumDealType === 'bunyang' && <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}> · 분양권 전매</span>}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
                    {sumDealType === 'jeonse' ? '전세 계약' : '월세 계약'} 기준
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: '6px' }}>
            {/* 현재 지역 (크게) + 지역 변경 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <h1 style={{
                fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 800, color: 'var(--text-primary)',
                margin: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', letterSpacing: '-0.5px',
              }}>
                <span aria-hidden="true" style={{ color: 'var(--accent)' }}>📍</span>{district}
              </h1>
              <button
                onClick={() => setPicker({ label: groupLabel, districts: DISTRICT_GROUPS[groupIdx]?.districts ?? [] })}
                aria-label="지역 변경"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  padding: '7px 14px', borderRadius: '9px', fontSize: '13px', fontWeight: 700,
                  backgroundColor: 'var(--accent)', color: '#FFFFFF', border: 'none', cursor: 'pointer',
                }}
              >
                지역 변경 ▾
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <DataFreshness result={detailFreshness[dealType]} requestKey={activeDetailRequestKey === urlRequestKey ? urlRequestKey : ''} />
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>· 출처: 국토교통부 실거래가 공개시스템</span>
            </div>
          </div>
        )}

        <section
          aria-labelledby="transactions-apartment-search-title"
          style={{
            position: 'relative', zIndex: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '18px', flexWrap: 'wrap',
            margin: '20px 0 24px', padding: '18px 20px',
            borderRadius: '16px', border: '1px solid var(--border)',
            background: 'var(--bg-card)',
          }}
        >
          <div style={{ minWidth: '210px', flex: '1 1 260px' }}>
            <h2
              id="transactions-apartment-search-title"
              style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}
            >
              우리 아파트 바로 찾기
            </h2>
            <p style={{ margin: '5px 0 0', fontSize: '12.5px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
              전국 단지명을 검색하면 해당 단지의 실거래만 정확히 보여드려요.
            </p>
          </div>
          <div role="search" style={{ flex: '2 1 360px', maxWidth: '620px', width: '100%' }}>
            <AptAutocomplete
              key={selectedApt?.id ?? (query ? `query:${query}` : 'transactions-global-search')}
              ariaLabel="전국 아파트 단지 검색"
              placeholder="단지명 검색 (예: 잠실엘스)"
              initialValue={selectedApt?.name ?? query}
              onClear={clearApartmentSearch}
              onResultIntent={(apartment) => router.prefetch(apartmentHref(apartment))}
              onSelect={selectApartment}
            />
          </div>
        </section>

        {/* 시도별 요약 카드 뷰 */}
        {viewMode === 'summary' && (
          <>
            {queryParam && !districtParam && (
              <GlobalApartmentSearchResults key={queryParam} query={queryParam} />
            )}

            {/* 거래 유형 탭 — 매매·전세·월세 오픈 (사이클 II), 선택 후 구 진입 시 해당 유형으로 시작 */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '18px', borderBottom: '1px solid var(--border)' }}>
              {DEAL_TYPE_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={dealType === key}
                  onClick={() => changeDealType(key)}
                  style={{
                    backgroundColor: dealType === key ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: dealType === key ? '#FFFFFF' : 'var(--text-dim)',
                    fontSize: '13px', fontWeight: dealType === key ? 700 : 600,
                    padding: '9px 18px', borderRadius: '10px 10px 0 0',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 섹션 헤더 + 집계 윈도우 토글 (2026-08-02 — 월초 공백 해소·지난달 조회) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 14px', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>시/도별 거래 현황</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '4px', padding: '3px', borderRadius: '10px', backgroundColor: 'var(--border-light)' }}>
                  {[
                    ...(dailyMeta && sumDealType === 'buy' ? [{ key: 'today', label: dailyIsToday ? '오늘 공개' : '최근 공개분' }] : []),
                    { key: 'rolling30', label: '최근 30일' },
                    ...windowMonths,
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={sumWindow === key}
                      onClick={() => setSumWindow(key)}
                      style={{
                        padding: '5px 12px', borderRadius: '7px', fontSize: '12px', fontWeight: 700,
                        border: 'none', cursor: 'pointer',
                        backgroundColor: sumWindow === key ? 'var(--bg-card)' : 'transparent',
                        color: sumWindow === key ? 'var(--text-primary)' : 'var(--text-dim)',
                        boxShadow: sumWindow === key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: '12.5px', color: 'var(--text-dim)' }}>
                  거래량순 · {sumDealType === 'jeonse' ? '평균 보증금' : sumDealType === 'monthly' ? '평균 보증금/월세' : '평균가'}는 전용면적 기준
                </span>
              </div>
            </div>
            {summaryLoading ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginTop: '20px' }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} style={{
                    height: '150px', borderRadius: '16px',
                    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                ))}
                <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
              </div>
            ) : summaryError ? (
              <>
                <TxErrorState
                  title="실거래 집계를 불러오지 못했어요"
                  description="현재 집계 데이터 연결을 확인하고 있습니다. 잠시 후 다시 시도해주세요."
                  onRetry={() => setSummaryRetryKey((key) => key + 1)}
                />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const group = DISTRICT_GROUPS[groupIdx] ?? DISTRICT_GROUPS[0];
                      if (group) setPicker({ label: group.label, districts: group.districts });
                    }}
                    style={{
                      padding: '11px 24px', borderRadius: '11px', fontSize: '13.5px', fontWeight: 700,
                      backgroundColor: 'var(--bg-card)', color: 'var(--accent)',
                      border: '1px solid var(--accent)', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    지역 선택
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                {[...summaryData]
                  .sort((a, b) => sumWindow === 'today'
                    ? (b.todayCount ?? 0) - (a.todayCount ?? 0)
                    : b.estimatedCount - a.estimatedCount)
                  .map((region, i) => (
                  <button
                    key={region.label}
                    onClick={() => {
                      // 아실형 — 카드 클릭 시 구 선택 모달
                      const group = DISTRICT_GROUPS.find((g) => g.label === region.label);
                      if (group) setPicker({ label: group.label, districts: group.districts });
                    }}
                    style={{
                      padding: '15px 16px', borderRadius: '14px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(20,33,61,0.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {/* 랭킹 뱃지 + 시도명 (11a) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <span style={{
                        width: '20px', height: '20px', borderRadius: '6px',
                        backgroundColor: i < 3 ? 'var(--accent)' : '#EEF2F8',
                        color: i < 3 ? '#FFFFFF' : '#9AA4B8',
                        fontSize: '11px', fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {i + 1}
                      </span>
                      <span style={{ fontSize: '15.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {region.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)' }}>
                        {(sumWindow === 'today' ? (region.todayCount ?? 0) : region.estimatedCount).toLocaleString()}<span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>건</span>
                      </span>
                      {(sumWindow === 'today' ? (region.todayNewHighs ?? 0) : region.newHighs) > 0 && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#E23B3B' }}>
                          신고가 {sumWindow === 'today' ? (region.todayNewHighs ?? 0) : region.newHighs}
                        </span>
                      )}
                    </div>

                    <div style={{
                      display: 'flex', gap: '12px',
                      paddingTop: '10px', borderTop: '1px solid var(--border-light)',
                    }}>
                      {region.avg59 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          59㎡{' '}
                          <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                            {region.avg59 >= 10000 ? `${(region.avg59 / 10000).toFixed(1)}억` : `${region.avg59.toLocaleString()}만`}
                            {sumDealType === 'monthly' && region.avgRent59 ? `/${region.avgRent59.toLocaleString()}만` : ''}
                          </strong>
                        </span>
                      )}
                      {region.avg84 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          84㎡{' '}
                          <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                            {region.avg84 >= 10000 ? `${(region.avg84 / 10000).toFixed(1)}억` : `${region.avg84.toLocaleString()}만`}
                            {sumDealType === 'monthly' && region.avgRent84 ? `/${region.avgRent84.toLocaleString()}만` : ''}
                          </strong>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!summaryError && (
              <>
                <p style={{ margin: '16px 0 20px', fontSize: '11px', color: 'var(--text-dim)' }}>
                  {(() => {
                    const body =
                      sumDealType === 'buy'     ? '계약 신고분 실집계 (취소 제외)' :
                      sumDealType === 'bunyang' ? '분양권 전매 신고분 실집계 (취소 제외)' :
                      `${sumDealType === 'jeonse' ? '전세' : '월세'} 계약 신고분 실집계`;
                    return sumWindow === 'today' && dailyMeta
                      ? `※ ${dailyMeta.date} 공개분 (아침 봇 집계) · 평균가는 최근 30일 기준`
                      : /^\d{6}$/.test(sumWindow)
                        ? `※ ${sumWindow.slice(0, 4)}년 ${parseInt(sumWindow.slice(4, 6), 10)}월 ${body}`
                        : `※ 최근 30일 ${body}`;
                  })()}
                  {sumDealType === 'monthly' ? ' · 금액은 평균 보증금/평균 월세' : sumDealType === 'jeonse' ? ' · 금액은 평균 보증금' : ''} · 지역을 클릭해 구를 선택하면 상세 거래를 확인할 수 있습니다.
                </p>

                {!summaryLoading && summaryData.length > 0 && (
                  <CoupangBanner variant="inline" subId="tx-summary" />
                )}

                {/* 조회를 넘어 분석까지 — 내집만의 기능 프로모 */}
                <AnalysisPromoBar />
              </>
            )}
          </>
        )}

        {/* detail 뷰 */}
        {viewMode === 'detail' && (
          <>
        <button
          onClick={showSummary}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '13px', fontWeight: 600, color: 'var(--accent)',
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 0', marginBottom: '12px',
          }}
        >
          ← 전체 보기
        </button>

        {/* 거래 유형 탭 — 매매·전세·월세 (사이클 II) */}
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: '20px', display: 'flex' }}>
          {DEAL_TYPE_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={dealType === key}
              onClick={() => changeDealType(key)}
              style={{
                padding: '12px 4px', marginRight: '24px', fontSize: '15px', fontWeight: 700,
                color: dealType === key ? 'var(--text-primary)' : 'var(--text-dim)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: dealType === key ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 구별 칩 (아실형 — 건수·신고가) */}
        <DistrictChips
          districts={DISTRICT_GROUPS[groupIdx]?.districts ?? []}
          stats={districtStats[groupLabel] ?? null}
          active={district}
          onPick={enterDistrict}
        />

        {/* 통계 바 + 정렬·필터 (매매) */}
        {dealType === 'buy' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap', marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {!loading && filtered.length > 0 && (
              <>
                <span style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
                  총&nbsp;<strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{totalTx.toLocaleString()}</strong>건
                </span>
                {newHighCnt > 0 && (
                  <span style={{ fontSize: '14px', color: 'var(--text-dim)' }}>
                    신고가&nbsp;<strong style={{ color: 'var(--up-color, #C92F2F)' }}>{newHighCnt}</strong>건
                  </span>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              aria-label="면적 필터"
              style={{
                padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', cursor: 'pointer', outline: 'none',
              }}
            >
              {AREA_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="정렬"
              style={{
                padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: 'var(--ink, #14213D)', color: '#FFFFFF',
                border: '1px solid var(--ink, #14213D)', cursor: 'pointer', outline: 'none',
              }}
            >
              {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setNewHighOnly((v) => !v)}
              aria-pressed={newHighOnly}
              style={{
                padding: '8px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: newHighOnly ? 'var(--up-color, #C92F2F)' : 'var(--bg-card)',
                color: newHighOnly ? '#FFFFFF' : 'var(--text-muted)',
                border: `1px solid ${newHighOnly ? 'var(--up-color, #C92F2F)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              신고가
            </button>
          </div>
        </div>
        )}

        {/* 통계 바 + 정렬 (전월세 — 전월세 v2: 월세 정렬) */}
        {(dealType === 'jeonse' || dealType === 'monthly') && !rentLoading && rentGroups.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', flexWrap: 'wrap', marginBottom: '20px',
        }}>
          <span style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
            총&nbsp;<strong style={{ color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>{rentTotalTx.toLocaleString()}</strong>건
          </span>
          <select
            value={rentSortKey}
            onChange={(e) => setRentSortKey(e.target.value as RentSortKey)}
            aria-label="전월세 정렬"
            style={{
              padding: '8px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
              backgroundColor: 'var(--ink, #14213D)', color: '#FFFFFF',
              border: '1px solid var(--ink, #14213D)', cursor: 'pointer', outline: 'none',
            }}
          >
            {RENT_SORT_OPTIONS
              .filter((o) => !o.monthlyOnly || dealType === 'monthly')
              .map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        )}

        {/* 기간 필터 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          {([
            { label: '2개월',  value: 2  },
            { label: '3개월',  value: 3  },
            { label: '6개월',  value: 6  },
            { label: '1년',    value: 12 },
            { label: '2년',    value: 24 },
            { label: '3년',    value: 36 },
          ] as { label: string; value: number }[]).map(({ label, value }) => (
            <button
              key={value}
              type="button"
              aria-pressed={months === value}
              onClick={() => changeMonths(value)}
              style={{
                padding: '10px 18px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                backgroundColor: months === value ? 'var(--accent)' : 'var(--bg-card)',
                color:           months === value ? '#FFFFFF'       : 'var(--text-dim)',
                border: `1px solid ${months === value ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}

        </div>

        {/* 매매 — 에러·스켈레톤·카드 그리드 */}
        {dealType === 'buy' && (
          <>
            {error && !loading && (
              <TxErrorState
                onRetry={() => {
                  setError(null);
                  load(district, months, apartmentRequestQuery, true);
                }}
              />
            )}

            {loading ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} style={{
                      height: '220px', borderRadius: '16px',
                      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  ))}
                </div>
                <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
              </>
            ) : filtered.length === 0 && !error ? (
              selectedApt ? (
                <div style={{
                  textAlign: 'center', padding: '48px 24px',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                  borderRadius: '16px',
                }}>
                  <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
                    「{selectedApt.name}」의 최근 {months >= 12 ? `${months / 12}년` : `${months}개월`} 매매 거래가 없어요
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>
                    기간을 늘리면 과거 거래가 보일 수 있어요.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => changeMonths(36)}
                      style={{
                        padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
                        backgroundColor: 'var(--accent)', color: '#FFFFFF', border: 'none', cursor: 'pointer',
                      }}
                    >
                      기간 3년으로 넓히기
                    </button>
                    <button
                      onClick={clearApartmentSearch}
                      style={{
                        padding: '9px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                        backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                      }}
                    >
                      이 지역 전체 보기
                    </button>
                  </div>
                </div>
              ) : (
                <TxEmptyState
                  onReset={resetDetailFilters}
                />
              )
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {/* 인피드 광고를 6번째 카드 뒤에 끼우기 위한 분할 렌더 (페이지당 인피드 1개 원칙) */}
                  {filtered.slice(0, 6).map((apt) => (
                    <AptCard key={apt.id} apt={apt} months={months} dealType="buy" onClick={() => setActiveApt(apt)} />
                  ))}
                </div>
                {filtered.length > 6 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px', marginTop: '12px' }}>
                    {filtered.slice(6).map((apt) => (
                      <AptCard key={apt.id} apt={apt} months={months} dealType="buy" onClick={() => setActiveApt(apt)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* 전세·월세 — 전용 카드 (사이클 II v1) */}
        {(dealType === 'jeonse' || dealType === 'monthly') && (
          <>
            {rentPartial && !rentLoading && !rentError && (
              <p role="status" style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '13px' }}>
                일부 월 자료를 불러오지 못해 현재 목록과 건수는 부분 집계입니다.
              </p>
            )}
            {rentError && !rentLoading && (
              <TxErrorState onRetry={() => setRentRetryKey((key) => key + 1)} />
            )}

            {rentLoading ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} style={{
                      height: '220px', borderRadius: '16px',
                      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  ))}
                </div>
                <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
              </>
            ) : (() => {
              if (rentSorted.length === 0 && !rentError) {
                return <TxEmptyState onReset={resetDetailFilters} />;
              }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {rentSorted.map((apt) => (
                    <RentAptCard key={apt.id} apt={apt} onClick={() => setActiveRent(apt)} />
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {/* 분양권 — 매매 카드·모달 재사용 (AptGroup 동일 구조) */}
        {dealType === 'bunyang' && (
          <>
            {silvPartial && !silvLoading && !silvError && (
              <p role="status" style={{ margin: '0 0 14px', color: 'var(--text-muted)', fontSize: '13px' }}>
                일부 월 자료를 불러오지 못해 현재 목록과 건수는 부분 집계입니다.
              </p>
            )}
            {silvError && !silvLoading && (
              <TxErrorState onRetry={() => setSilvRetryKey((key) => key + 1)} />
            )}

            {silvLoading ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {[...Array(8)].map((_, i) => (
                    <div key={i} style={{
                      height: '220px', borderRadius: '16px',
                      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-light)',
                      animation: 'pulse 1.5s ease-in-out infinite',
                    }} />
                  ))}
                </div>
                <style>{`@keyframes pulse{0%,100%{opacity:.3}50%{opacity:.6}}`}</style>
              </>
            ) : (() => {
              if (silvVisibleGroups.length === 0 && !silvError) {
                return <TxEmptyState onReset={resetDetailFilters} />;
              }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                  {silvVisibleGroups.map((apt) => (
                    <AptCard key={apt.id} apt={apt} months={months} dealType="bunyang" onClick={() => setActiveApt(apt)} />
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {(
          (dealType === 'buy' && !loading && !error && filtered.length > 0)
          || ((dealType === 'jeonse' || dealType === 'monthly') && !rentLoading && !rentError && rentSorted.length > 0)
          || (dealType === 'bunyang' && !silvLoading && !silvError && silvVisibleGroups.length > 0)
        ) && (
          <CoupangBanner variant="inline" subId={`tx-${dealType}-feed`} />
        )}

        <p style={{ marginTop: '24px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
          {dealType === 'buy'
            ? '※ 매매 계약일 기준 · 신고가는 조회 기간 내 유사 면적(±6㎡)의 이전 계약 최고가를 경신한 거래 · 비교 거래가 없으면 신고가로 표시하지 않습니다.'
            : dealType === 'bunyang'
            ? '※ 분양권 계약일 기준 · 국토교통부 분양권 전매 신고분 · 가격은 신고 거래금액'
            : '※ 전월세 계약일 기준 · 보증금/월세는 국토교통부 신고 금액 · 신규/갱신은 계약 구분 신고값 (미신고 시 빈칸) · 정렬의 보증금/월세는 조회 기간 내 단지 최고액 기준'}
        </p>
          </>
        )}
      </div>

      {/* 지역 선택 모달 — 전국화 (시/도 전환 가능) */}
      {picker && (
        <RegionPickerModal
          initialLabel={picker.label}
          activeDistrict={viewMode === 'detail' ? district : undefined}
          onPick={enterDistrict}
          onClose={() => setPicker(null)}
        />
      )}

      {/* 단지 상세 모달 */}
      {activeApt && (
        <AptDetailModal
          key={`${routeSelectionKey}:${activeApt.id}`}
          apt={activeApt}
          onClose={() => setActiveApt(null)}
          months={months}
          dealType={dealType === 'bunyang' ? 'bunyang' : 'buy'}
          initialTx={txParam}
        />
      )}

      {/* 전월세 상세 모달 (전월세 v2) */}
      {activeRent && (
        <RentAptDetailModal
          key={`${routeSelectionKey}:${activeRent.id}`}
          apt={activeRent}
          onClose={() => setActiveRent(null)}
          months={months}
          initialTx={rtxParam}
        />
      )}
    </main>
    </>
  );
}
