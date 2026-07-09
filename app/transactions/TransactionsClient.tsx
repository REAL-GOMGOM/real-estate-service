'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { TxErrorState, TxEmptyState } from '@/components/shared/TxStates';
import { AnalysisPromoBar } from '@/components/shared/AnalysisPromoBar';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { matchesQuery } from '@/lib/search-utils';
import Header from '@/components/layout/Header';
import { AptAutocomplete, type ApartmentSearchResult } from '@/components/search/AptAutocomplete';
import { type AptGroup, type DistrictStat, detectNewHigh } from './types';
import { sortRentGroups, type RentAptGroup, type RentSortKey } from '@/lib/rent-shared';
import AptCard from './components/AptCard';
import RentAptCard from './components/RentAptCard';
import RentAptDetailModal from './components/RentAptDetailModal';
import AptDetailModal from './components/AptDetailModal';
import RegionPickerModal from './components/RegionPickerModal';
import DistrictChips from './components/DistrictChips';

/**
 * 실거래 조회 클라이언트 — 사이클 W (아실형 개편)
 *
 * summary(시도 카드) → 구 선택 모달 → detail(구 칩 + 아실형 단지 카드).
 * 정렬(거래량·최신·가격) + 신고가만 + 면적 필터.
 */

function findGroupIndexOfDistrict(district: string): number {
  return DISTRICT_GROUPS.findIndex((g) => g.districts.includes(district));
}

function todayLabel(d: Date) {
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}.${d.getDate()}(${day})`;
}

/** 11a 타이틀 밴드용 — 2026.07.05(일) 형식 */
function fullDateLabel(d: Date) {
  const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}.${mm}.${dd}(${day})`;
}

type SortKey = 'volume' | 'date' | 'price';

/** 거래 유형 탭 — 사이클 II (전세·월세 오픈) */
type DealType = 'buy' | 'jeonse' | 'monthly';
const DEAL_TYPE_TABS: { key: DealType; label: string }[] = [
  { key: 'buy',     label: '매매' },
  { key: 'jeonse',  label: '전세' },
  { key: 'monthly', label: '월세' },
];

interface SummaryRegion {
  label:          string;
  estimatedCount: number;
  newHighs:       number;
  avg59:          number | null;
  avg84:          number | null;
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

// 전월세 정렬 (전월세 v2) — monthlyOnly 는 월세 탭에서만 노출
const RENT_SORT_OPTIONS: { key: RentSortKey; label: string; monthlyOnly?: boolean }[] = [
  { key: 'volume',  label: '거래많은순' },
  { key: 'date',    label: '최신순' },
  { key: 'deposit', label: '보증금높은순' },
  { key: 'monthly', label: '월세높은순', monthlyOnly: true },
];

export default function TransactionsClient() {
  const searchParams  = useSearchParams();
  const districtParam = searchParams.get('district');
  const queryParam    = searchParams.get('q');

  const [today, setToday] = useState(new Date(0));
  useEffect(() => { setToday(new Date()); }, []);

  const [district,  setDistrict]  = useState(districtParam || '강남구');
  const [groupIdx,  setGroupIdx]  = useState(() => Math.max(0, findGroupIndexOfDistrict(districtParam || '강남구')));
  const [months,    setMonths]    = useState(6);
  const [query,     setQuery]     = useState(queryParam ?? '');
  const [groups,    setGroups]    = useState<AptGroup[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fetched,   setFetched]   = useState('');
  const [activeApt, setActiveApt] = useState<AptGroup | null>(null);

  const [viewMode, setViewMode] = useState<'summary' | 'detail'>(districtParam ? 'detail' : 'summary');

  // 거래 유형 (사이클 II) — 전월세는 별도 데이터·카드 경로
  const [dealType, setDealType] = useState<DealType>('buy');
  const [rentGroups,  setRentGroups]  = useState<RentAptGroup[]>([]);
  const [rentLoading, setRentLoading] = useState(false);
  const [rentError,   setRentError]   = useState(false);
  const [rentFetched, setRentFetched] = useState('');
  const [rentSortKey, setRentSortKey] = useState<RentSortKey>('volume');
  const [activeRent,  setActiveRent]  = useState<RentAptGroup | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryRegion[]>([]);
  const [dailyMeta, setDailyMeta] = useState<DailyMeta | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // 구 선택 모달 (아실형) — 열려 있으면 해당 시도 그룹
  const [picker, setPicker] = useState<{ label: string; districts: string[] } | null>(null);

  // 구별 칩 통계 — 그룹 단위 캐시
  const [districtStats, setDistrictStats] = useState<Record<string, DistrictStat[]>>({});

  // 정렬·필터
  const [sortKey,     setSortKey]     = useState<SortKey>('volume');
  const [newHighOnly, setNewHighOnly] = useState(false);
  const [areaFilter,  setAreaFilter]  = useState('all');

  // 딥링크 — district(+q) 로 바로 detail 진입
  useEffect(() => {
    if (districtParam) {
      setDistrict(districtParam);
      setGroupIdx(Math.max(0, findGroupIndexOfDistrict(districtParam)));
      if (queryParam) setQuery(queryParam);
      setViewMode('detail');
      setFetched('');
    }
  }, [districtParam, queryParam]);

  const load = useCallback(async (d: string, m: number) => {
    const key = `${d}-${m}`;
    if (fetched === key) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/transactions?district=${encodeURIComponent(d)}&months=${m}`);
      const json = await res.json();
      setGroups(json.data ?? []);
      setFetched(key);
    } catch {
      setGroups([]);
      setError('데이터 조회에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [fetched]);

  useEffect(() => {
    if (viewMode === 'detail' && dealType === 'buy') load(district, months);
  }, [district, months, viewMode, dealType, load]);

  // 전월세 조회 (사이클 II) — 매매 캐시(fetched)와 별개 키
  useEffect(() => {
    if (viewMode !== 'detail' || dealType === 'buy') return;
    const key = `${district}-${months}-${dealType}`;
    if (rentFetched === key) return;
    let cancelled = false;
    setRentLoading(true);
    setRentError(false);
    fetch(`/api/transactions/rent?district=${encodeURIComponent(district)}&months=${months}&rentType=${dealType}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setRentGroups(json.data ?? []);
        setRentFetched(key);
        setRentLoading(false);
        if (json.error) setRentError(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRentGroups([]);
        setRentError(true);
        setRentLoading(false);
      });
    return () => { cancelled = true; };
  }, [viewMode, dealType, district, months, rentFetched]);

  // 시도별 요약
  useEffect(() => {
    if (viewMode !== 'summary') return;
    setSummaryLoading(true);
    fetch('/api/transactions/summary')
      .then(r => r.json())
      .then(json => {
        setSummaryData(json.summary || []);
        setDailyMeta(json.daily ?? null);
        setSummaryLoading(false);
      })
      .catch(() => setSummaryLoading(false));
  }, [viewMode]);

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
    let list = query.trim() ? groups.filter((g) => matchesQuery(g.name, query.trim())) : groups;

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
  }, [groups, query, newHighOnly, areaFilter, sortKey]);

  const totalTx    = filtered.reduce((s, g) => s + g.transactions.length, 0);
  const newHighCnt = filtered.filter(detectNewHigh).length;

  // 전월세 파생값 (전월세 v2 — 월세 정렬): 검색 필터 → 정렬. 총 건수는 서버 원본 건수(txCount) 합
  const rentFiltered = query.trim() ? rentGroups.filter((g) => matchesQuery(g.name, query.trim())) : rentGroups;
  const rentSorted   = sortRentGroups(rentFiltered, rentSortKey);
  const rentTotalTx  = rentFiltered.reduce((s, g) => s + (g.txCount ?? g.transactions.length), 0);

  const enterDistrict = (d: string) => {
    setGroupIdx(Math.max(0, findGroupIndexOfDistrict(d)));
    setDistrict(d);
    setViewMode('detail');
    setFetched('');
    setPicker(null);
  };

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
                {dailyMeta ? '오늘 아침 공개' : '이번 달 신고 집계'}
              </div>
              <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(22px, 3vw, 29px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.6px' }}>
                오늘 공개된 최신 실거래
              </h1>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
                {today.getFullYear() > 2000 ? fullDateLabel(today) : '—'} · 국토교통부 실거래가 공개시스템 기준
              </p>
            </div>
            {!summaryLoading && summaryData.length > 0 && (
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>총</span>
                  <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Roboto Mono, monospace' }}>
                    {(dailyMeta ? dailyMeta.totalCount : summaryData.reduce((s, r) => s + r.estimatedCount, 0)).toLocaleString()}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)' }}>건</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#E23B3B', marginTop: '2px' }}>
                  신고가 {dailyMeta ? dailyMeta.totalNewHighs : summaryData.reduce((s, r) => s + r.newHighs, 0)}건 🔥
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <h1 style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, color: 'var(--text-primary)' }}>
                최신 실거래
              </h1>
              <span style={{
                padding: '4px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)',
              }}>
                {today.getFullYear() > 2000 ? todayLabel(today) : '—'}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>출처: 국토교통부 실거래가 공개시스템</p>
          </div>
        )}

        {/* 시도별 요약 카드 뷰 */}
        {viewMode === 'summary' && (
          <>
            {/* 거래 유형 탭 — 매매·전세·월세 오픈 (사이클 II), 선택 후 구 진입 시 해당 유형으로 시작 */}
            <div style={{ display: 'flex', gap: '6px', marginTop: '18px', borderBottom: '1px solid var(--border)' }}>
              {DEAL_TYPE_TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDealType(key)}
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

            {/* 전월세 탭 안내 — summary(시도별)는 매매 전용 집계라, 전세/월세는 구 선택 후 제공 */}
            {dealType !== 'buy' && (
              <div style={{
                marginTop: '12px', padding: '12px 14px', borderRadius: '10px',
                backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6,
              }}>
                {dealType === 'jeonse' ? '전세' : '월세'} 시세는{' '}
                <strong style={{ color: 'var(--text-primary)' }}>지역(구) 단위</strong>로 제공됩니다.
                아래 시/도를 눌러 구를 선택하면 확인할 수 있어요.
                <span style={{ color: 'var(--text-dim)' }}> (아래 카드 숫자는 매매 기준)</span>
              </div>
            )}

            {/* 섹션 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 0 14px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>시/도별 거래 현황</span>
              <span style={{ fontSize: '12.5px', color: 'var(--text-dim)' }}>거래량순 · 평균가는 전용면적 기준</span>
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
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                {[...summaryData]
                  .sort((a, b) =>
                    (b.todayCount ?? b.estimatedCount) - (a.todayCount ?? a.estimatedCount))
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
                        {(region.todayCount !== undefined ? region.todayCount : region.estimatedCount).toLocaleString()}<span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)' }}>건{region.todayCount === undefined && dailyMeta ? ' (월)' : ''}</span>
                      </span>
                      {(region.todayCount !== undefined ? (region.todayNewHighs ?? 0) : region.newHighs) > 0 && (
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#E23B3B' }}>
                          신고가 {region.todayCount !== undefined ? region.todayNewHighs : region.newHighs}
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
                          </strong>
                        </span>
                      )}
                      {region.avg84 && (
                        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                          84㎡{' '}
                          <strong style={{ color: 'var(--text-secondary)', fontFamily: 'Roboto Mono, monospace' }}>
                            {region.avg84 >= 10000 ? `${(region.avg84 / 10000).toFixed(1)}억` : `${region.avg84.toLocaleString()}만`}
                          </strong>
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p style={{ margin: '16px 0 20px', fontSize: '11px', color: 'var(--text-dim)' }}>
              {dailyMeta ? `※ ${dailyMeta.date} 공개분 (아침 봇 집계) · 평균가는 당월 기준` : '※ 등록 시군구 전체 실집계 (당월 신고 누계)'} · 지역을 클릭해 구를 선택하면 상세 거래를 확인할 수 있습니다.
            </p>

            {/* 조회를 넘어 분석까지 — 내집만의 기능 프로모 */}
            <AnalysisPromoBar />
          </>
        )}

        {/* detail 뷰 */}
        {viewMode === 'detail' && (
          <>
        <button
          onClick={() => setViewMode('summary')}
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
              onClick={() => {
                setDealType(key);
                // 전세 탭엔 월세 축이 없음 — 월세 정렬 상태면 기본으로 리셋
                if (key !== 'monthly' && rentSortKey === 'monthly') setRentSortKey('volume');
              }}
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
          onPick={(d) => { setDistrict(d); setFetched(''); }}
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
        {dealType !== 'buy' && !rentLoading && rentGroups.length > 0 && (
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

        {/* 기간 필터 + 검색 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
          {([
            { label: '3개월',  value: 3  },
            { label: '6개월',  value: 6  },
            { label: '1년',    value: 12 },
            { label: '2년',    value: 24 },
            { label: '3년',    value: 36 },
          ] as { label: string; value: number }[]).map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setMonths(value); setFetched(''); }}
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

          <div style={{ flex: 1, minWidth: '220px' }}>
            <AptAutocomplete
              placeholder="단지명 입력 (예: 잠실엘스)"
              onSelect={(apt: ApartmentSearchResult) => {
                const districtLabel = findDistrictByLawdCd(apt.lawdCd) ?? apt.sigungu;
                const matched = findGroupIndexOfDistrict(districtLabel);
                if (matched >= 0) setGroupIdx(matched);
                setDistrict(districtLabel);
                setQuery(apt.name);
                setFetched('');
              }}
            />
          </div>
        </div>

        {/* 매매 — 에러·스켈레톤·카드 그리드 */}
        {dealType === 'buy' && (
          <>
            {error && !loading && (
              <TxErrorState
                onRetry={() => { setError(null); setFetched(''); load(district, months); }}
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
              <TxEmptyState
                onReset={() => { setQuery(''); setNewHighOnly(false); setAreaFilter('all'); setMonths(6); setFetched(''); }}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                {filtered.map((apt) => (
                  <AptCard key={apt.id} apt={apt} onClick={() => setActiveApt(apt)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* 전세·월세 — 전용 카드 (사이클 II v1) */}
        {dealType !== 'buy' && (
          <>
            {rentError && !rentLoading && (
              <TxErrorState onRetry={() => setRentFetched('')} />
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
                return <TxEmptyState onReset={() => { setQuery(''); setMonths(6); setRentFetched(''); }} />;
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

        <p style={{ marginTop: '24px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8 }}>
          {dealType === 'buy'
            ? '※ 매매 계약일 기준 · 신고가는 조회 기간 내 동일 면적 최고가 기준 · 전고점은 조회 기간 내 대표 면적 최고가'
            : '※ 전월세 계약일 기준 · 보증금/월세는 국토교통부 신고 금액 · 신규/갱신은 계약 구분 신고값 (미신고 시 빈칸) · 정렬의 보증금/월세는 조회 기간 내 단지 최고액 기준'}
        </p>
          </>
        )}
      </div>

      {/* 구 선택 모달 */}
      {picker && (
        <RegionPickerModal
          label={picker.label}
          districts={picker.districts}
          onPick={enterDistrict}
          onClose={() => setPicker(null)}
        />
      )}

      {/* 단지 상세 모달 */}
      {activeApt && (
        <AptDetailModal
          apt={activeApt}
          onClose={() => setActiveApt(null)}
          months={months}
        />
      )}

      {/* 전월세 상세 모달 (전월세 v2) */}
      {activeRent && (
        <RentAptDetailModal
          apt={activeRent}
          onClose={() => setActiveRent(null)}
          months={months}
        />
      )}
    </main>
    </>
  );
}
