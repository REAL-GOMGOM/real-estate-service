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
const POPULAR_APARTMENTS = [
  { district: '강남구', aptName: '은마아파트' },
  { district: '강남구', aptName: '래미안대치팰리스' },
  { district: '강남구', aptName: '도곡렉슬' },
  { district: '서초구', aptName: '반포자이' },
  { district: '서초구', aptName: '아크로리버파크' },
  { district: '송파구', aptName: '헬리오시티' },
  { district: '송파구', aptName: '리센츠' },
  { district: '마포구', aptName: '마포래미안푸르지오' },
  { district: '용산구', aptName: '파크타워' },
  { district: '성동구', aptName: '서울숲트리마제' },
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
  const [compareYear, setCompareYear] = useState(2025);
  // 현재 시세 — 티커 표시용 (table BTC/금 열은 entry.data의 역사적 시세 사용)
  const [btcKrw,         setBtcKrw]         = useState<number | null>(null);
  const [goldKrwPerGram, setGoldKrwPerGram] = useState<number | null>(null);
  const [entries,     setEntries]     = useState<ApartmentEntry[]>(() =>
    POPULAR_APARTMENTS.map(({ district, aptName }) => ({
      id: makeId(district, aptName), aptName, district,
      data: null, loading: true, error: null,
    })),
  );

  // 단일 단지 데이터 fetch
  const fetchEntry = useCallback(async (
    district: string,
    aptName:  string,
    base:     number,
    compare:  number,
  ): Promise<{ data: DollarApiResult | null; error: string | null }> => {
    const params = new URLSearchParams({
      district, aptName,
      baseYear:    String(base),
      compareYear: String(compare),
    });
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
      list.map((e) => fetchEntry(e.district, e.aptName, base, compare)),
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

  // 환율 — 데이터 로드 전에는 정적 테이블 값 사용 (하드코딩 방지)
  const rateEntry = entries.find((e) => e.data);
  const baseRate    = rateEntry?.data?.baseExchangeRate    ?? getStaticRate(baseYear);
  const compareRate = rateEntry?.data?.compareExchangeRate ?? getStaticRate(compareYear);

  const isAnyLoading = entries.some((e) => e.loading);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: '#0A0E1A', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px' }}>

        {/* 페이지 헤더 */}
        <div style={{ marginBottom: '36px' }}>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 800, color: '#F1F5F9', marginBottom: '8px' }}>
            실질 가치 비교
          </h1>
          <p style={{ fontSize: '14px', color: '#CBD5E1' }}>
            달러 · 비트코인 · 금 기준으로 아파트 실질 가치가 어떻게 변했는지 확인합니다
          </p>
        </div>

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

        {/* 범례 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: '#475569', marginRight: '4px' }}>변동 뱃지:</span>
          {/* 달러 */}
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>달러 환산 이익</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(248,113,113,0.12)', color: '#F87171' }}>달러 환산 손실</span>
          <span style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255,255,255,0.08)', display: 'inline-block' }} />
          {/* BTC */}
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(45,212,191,0.12)', color: '#2DD4BF' }}>BTC 환산 이익</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(249,115,22,0.12)', color: '#FB923C' }}>BTC 환산 손실</span>
          <span style={{ width: '1px', height: '14px', backgroundColor: 'rgba(255,255,255,0.08)', display: 'inline-block' }} />
          {/* 금 */}
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(163,230,53,0.12)', color: '#A3E635' }}>금 환산 이익</span>
          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(251,191,36,0.12)', color: '#FBBF24' }}>금 환산 손실</span>
        </div>

        {/* 비교 테이블 */}
        <ApartmentDollarTable
          entries={entries}
          baseYear={baseYear}
          compareYear={compareYear}
          onRemove={handleRemove}
        />

        {/* 데이터 출처 */}
        <p style={{
          marginTop: '32px', fontSize: '11px', color: '#334155', lineHeight: 1.8,
        }}>
          ※ 아파트 가격: 국토교통부 실거래가 공개시스템 Q4(10~12월) 평균가 기준 &nbsp;|&nbsp;
          환율: {rateEntry ? '한국은행 ECOS' : '정적 연간 평균 (한국은행 키 미설정)'} &nbsp;|&nbsp;
          BTC·금: CoinGecko 실시간 (PAX Gold 추적) &nbsp;|&nbsp;
          ₿·Au 환산은 현재 시세 기준으로 과거 연도에 적용되어 참고용입니다.
        </p>
      </div>
    </main>
  );
}
