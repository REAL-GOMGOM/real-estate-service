'use client';

import { useState, useEffect, useCallback } from 'react';
import ExchangeRateBanner from '@/components/dollar/ExchangeRateBanner';
import ApartmentSearch    from '@/components/dollar/ApartmentSearch';
import ApartmentDollarTable from '@/components/dollar/ApartmentDollarTable';
import { getStaticRate } from '@/lib/exchange-rate';
import CryptoTicker from '@/components/dollar/CryptoTicker';
import type { ApartmentEntry, DollarApiResult } from '@/lib/types';

// ────────────────────────────────────────────────
// 인기 단지 초기 목록
// ────────────────────────────────────────────────
// 2026-07-19 4개로 축소 — 초기 진입 시 단지당 /api/dollar 병렬 호출이 나가
// 11개는 첫 로딩이 과도하게 느렸음. 상징성 큰 4개만 기본, 나머지는 검색 추가.
// aptName 은 MOLIT aptNm 매칭 검색어 (봇 DB 실표기 검증), label 은 표시명.
const POPULAR_APARTMENTS = [
  { district: '강남구', aptName: '은마아파트' },
  { district: '강남구', aptName: '신현대',   label: '압구정 신현대' },
  { district: '강남구', aptName: '도곡렉슬' },
  { district: '송파구', aptName: '잠실엘스' },
] as const;

// re-export for sub-components
export type { ApartmentEntry } from '@/lib/types';
export type { DollarApiResult } from '@/lib/types';

function makeId(district: string, aptName: string) {
  return `${district}-${aptName}`;
}

// ────────────────────────────────────────────────
// 메인 클라이언트 컴포넌트
// ────────────────────────────────────────────────
export default function DollarPageClient() {
  const [baseYear,    setBaseYear]    = useState(2020);
  // 기본 비교 연도 = 현재 연도 (연중 시세) — 2026-07-12 최신화
  const [compareYear, setCompareYear] = useState(() => new Date().getFullYear());
  // 현재 시세 — 티커 표시용 (table BTC/금 열은 entry.data의 역사적 시세 사용)
  const [, setBtcKrw]         = useState<number | null>(null);
  const [, setGoldKrwPerGram] = useState<number | null>(null);
  const [entries,     setEntries]     = useState<ApartmentEntry[]>(() =>
    POPULAR_APARTMENTS.map((a) => ({
      id: makeId(a.district, a.aptName), aptName: a.aptName,
      label: 'label' in a ? a.label : undefined, district: a.district,
      data: null, loading: true, error: null,
    })),
  );

  // 단일 단지 데이터 fetch
  const fetchEntry = useCallback(async (
    district: string,
    aptName:  string,
    base:     number,
    compare:  number,
    area:     number | null = null,
  ): Promise<{ data: DollarApiResult | null; error: string | null }> => {
    const params = new URLSearchParams({
      district, aptName,
      baseYear:    String(base),
      compareYear: String(compare),
    });
    if (area !== null) params.set('area', String(area));
    try {
      const res  = await fetch(`/api/dollar?${params}`);
      const json = await res.json();
      if (!res.ok) return { data: null, error: json.error ?? '조회 실패' };
      return { data: json, error: null };
    } catch {
      return { data: null, error: '네트워크 오류' };
    }
  }, []);

  // 전체 목록 (재)조회 — 연도 변경 또는 초기 로드 시
  const refetchAll = useCallback(async (
    list:    ApartmentEntry[],
    base:    number,
    compare: number,
  ) => {
    // 모두 loading 상태로 전환
    setEntries(list.map((e) => ({ ...e, loading: true, data: null, error: null })));

    // 병렬 fetch
    const results = await Promise.allSettled(
      list.map((e) => fetchEntry(e.district, e.aptName, base, compare, e.area ?? null)),
    );

    setEntries(list.map((e, i) => {
      const r = results[i];
      if (r.status === 'rejected') return { ...e, loading: false, error: '조회 실패' };
      return { ...e, loading: false, data: r.value.data, error: r.value.error };
    }));
  }, [fetchEntry]);

  // 초기 로드
  useEffect(() => {
    refetchAll(entries, baseYear, compareYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 연도 변경
  function handleBaseYearChange(y: number) {
    setBaseYear(y);
    refetchAll(entries, y, compareYear);
  }
  function handleCompareYearChange(y: number) {
    setCompareYear(y);
    refetchAll(entries, baseYear, y);
  }

  // 단지 추가
  async function handleAdd(district: string, aptName: string) {
    const id = makeId(district, aptName);
    if (entries.find((e) => e.id === id)) return; // 중복 방지

    const newEntry: ApartmentEntry = { id, aptName, district, data: null, loading: true, error: null };
    setEntries((prev) => [...prev, newEntry]);

    const { data, error } = await fetchEntry(district, aptName, baseYear, compareYear);
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, loading: false, data, error } : e));
  }

  // 단지 삭제
  function handleRemove(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  // 평형 변경 — 해당 단지만 재조회 (null = 전체 평균)
  async function handleAreaChange(id: string, area: number | null) {
    const target = entries.find((e) => e.id === id);
    if (!target) return;
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, area, loading: true } : e));
    const { data, error } = await fetchEntry(target.district, target.aptName, baseYear, compareYear, area);
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, loading: false, data, error } : e));
  }

  // 환율 — 데이터 로드 전에는 정적 테이블 값 사용 (하드코딩 방지)
  const rateEntry = entries.find((e) => e.data);
  const baseRate    = rateEntry?.data?.baseExchangeRate    ?? getStaticRate(baseYear);
  const compareRate = rateEntry?.data?.compareExchangeRate ?? getStaticRate(compareYear);

  const isAnyLoading = entries.some((e) => e.loading);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px' }}>

        {/* 페이지 헤더 */}
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            실질 가치 비교
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            아파트 매매가를 달러, 비트코인, 금으로 환산하여 실질 가치 변동을 분석합니다. 출처: 국토교통부, 한국은행
          </p>
        </div>

        {/* 개념 안내 — 첫 방문자용 접이식 */}
        <details style={{
          marginBottom: '28px', padding: '14px 18px', borderRadius: '12px',
          backgroundColor: 'var(--accent-bg)', border: '1px solid var(--border-light)',
        }}>
          <summary style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>
            💡 왜 금·비트코인으로 재나요?
          </summary>
          <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)', margin: '10px 0 0' }}>
            집값이 올라도 <b>돈의 가치가 그만큼 떨어졌다면</b> 실제로 오른 걸까요?
            원화 대신 달러·금·비트코인처럼 다른 잣대로 같은 아파트를 재보면,
            상승분 중 얼마가 진짜 가치 상승이고 얼마가 화폐 가치 하락분인지 가늠할 수 있습니다.
            예컨대 원화로 70% 올랐는데 금으로 재면 30% 줄었다면 — 금 보유자 입장에선 이 아파트가 오히려 싸진 셈입니다.
          </p>
        </details>

        {/* 가격 티커 (달러·비트코인·금 현황) */}
        <CryptoTicker
          baseYear={baseYear}
          baseRate={baseRate}
          compareYear={compareYear}
          compareRate={compareRate}
          onBtcKrw={setBtcKrw}
          onGoldKrwPerGram={setGoldKrwPerGram}
        />

        {/* 연도 선택 배너 */}
        <ExchangeRateBanner
          baseYear={baseYear}
          compareYear={compareYear}
          baseRate={baseRate}
          compareRate={compareRate}
          onBaseYearChange={handleBaseYearChange}
          onCompareYearChange={handleCompareYearChange}
        />

        {/* 단지 추가 검색 */}
        <ApartmentSearch onAdd={handleAdd} loading={isAnyLoading} />

        {/* 안내 — 뱃지 범례는 카드별 해석 문장으로 대체 (2026-07-12) */}
        <p style={{ fontSize: '11.5px', color: 'var(--text-dim)', marginBottom: '12px' }}>
          카드의 💡 문장이 각 단지의 실질 가치 변화를 요약합니다 · 각 카드에서 이미지·텍스트로 공유할 수 있어요
        </p>

        {/* 비교 테이블 */}
        <ApartmentDollarTable
          entries={entries}
          baseYear={baseYear}
          compareYear={compareYear}
          onRemove={handleRemove}
          onAreaChange={handleAreaChange}
        />

        {/* 데이터 출처 */}
        <p style={{
          marginTop: '32px', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.8,
        }}>
          ※ 아파트 가격: 국토교통부 실거래가 — 과거 연도는 Q4(10~12월) 평균, 올해는 최근 3개월 신고분 평균(연중) &nbsp;|&nbsp;
          환율: {rateEntry ? '한국은행 ECOS' : '정적 연간 평균 (한국은행 키 미설정)'} &nbsp;|&nbsp;
          BTC·금: CoinGecko 실시간 (PAX Gold 추적) &nbsp;|&nbsp;
          ₿·Au 환산은 현재 시세 기준으로 과거 연도에 적용되어 참고용입니다.
        </p>
      </div>
    </main>
  );
}
