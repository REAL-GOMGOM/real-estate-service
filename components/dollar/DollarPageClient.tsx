'use client';

import { useState, useEffect, useCallback } from 'react';
import ExchangeRateBanner from '@/components/dollar/ExchangeRateBanner';
import ApartmentSearch    from '@/components/dollar/ApartmentSearch';
import ApartmentDollarTable from '@/components/dollar/ApartmentDollarTable';
import CryptoTicker from '@/components/dollar/CryptoTicker';
import type { ApartmentEntry, DollarApiResult, DollarQuoteProvenance } from '@/lib/types';

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

  // API 출처가 확인되기 전에는 임의/정적 값을 먼저 정상값처럼 표시하지 않는다.
  const rateEntry = entries.find((e) => e.data);
  const baseRate    = rateEntry?.data?.baseExchangeRate    ?? null;
  const compareRate = rateEntry?.data?.compareExchangeRate ?? null;
  const provenance  = rateEntry?.data?.provenance;

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
            국토교통부 실거래 표본을 달러·비트코인·금 기준으로 다시 봅니다. 각 환산값의 실제 출처와 표본 수를 함께 확인하세요.
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
          baseSource={provenance?.exchangeRate.base}
          compareSource={provenance?.exchangeRate.compare}
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

        <DataDisclosure data={rateEntry?.data ?? null} />
      </div>
    </main>
  );
}

function sourceLine(label: string, base: DollarQuoteProvenance, compare: DollarQuoteProvenance) {
  const format = (quote: DollarQuoteProvenance) => {
    const asOf = quote.asOf
      ? ` · ${new Date(quote.asOf).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} 조회`
      : '';
    return `${quote.period} ${quote.source}${asOf} — ${quote.note}`;
  };
  return `${label}: ${format(base)} / ${format(compare)}`;
}

function DataDisclosure({ data }: { data: DollarApiResult | null }) {
  if (!data) {
    return (
      <p style={{ marginTop: '32px', fontSize: '11.5px', color: 'var(--text-dim)' }}>
        데이터 출처와 표본 범위를 확인하는 중입니다.
      </p>
    );
  }

  const { transactions, exchangeRate, bitcoin, gold } = data.provenance;
  const formatMonths = (months: string[]) => months.length > 0
    ? months.map((month) => `${month.slice(0, 4)}-${month.slice(4)}`).join(', ')
    : '일치 거래 없음';
  const formatWindow = (window: typeof transactions.base) => {
    const failed = window.failedMonths.length > 0
      ? ` · 실패월 ${formatMonths(window.failedMonths)}`
      : '';
    const expanded = window.fallbackUsed ? ' · 연도 내 추가 월 조회' : '';
    return `${window.sampleCount}건 · 일치월 ${formatMonths(window.matchedMonths)} · 조회성공 ${window.successfulMonths.length}/${window.requestedMonths.length}개월${failed}${expanded}`;
  };

  return (
    <section style={{
      marginTop: '32px', padding: '18px 20px', borderRadius: '14px',
      border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)',
      color: 'var(--text-dim)', fontSize: '11.5px', lineHeight: 1.75,
    }} aria-labelledby="dollar-data-source-title">
      <h2 id="dollar-data-source-title" style={{
        margin: '0 0 8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 750,
      }}>
        데이터 기준과 한계
      </h2>
      <p style={{ margin: 0 }}>
        아파트: {transactions.source} · {transactions.matchMethod} · 거래 해제 제외 · {transactions.aggregation}
      </p>
      <p style={{ margin: 0 }}>
        표시 단지 “{data.aptName}” · {data.baseYear}년 {formatWindow(transactions.base)}
      </p>
      <p style={{ margin: 0 }}>
        표시 단지 “{data.aptName}” · {data.compareYear}년 {formatWindow(transactions.compare)}
      </p>
      <p style={{ margin: '5px 0 0' }}>{sourceLine('환율', exchangeRate.base, exchangeRate.compare)}</p>
      <p style={{ margin: 0 }}>{sourceLine('비트코인', bitcoin.base, bitcoin.compare)}</p>
      <p style={{ margin: 0 }}>{sourceLine('금', gold.base, gold.compare)}</p>
      <p style={{ margin: '5px 0 0' }}>
        현재 호가는 연평균이 아니며, PAXG 환산 금값은 실물 금 고시가격이 아닙니다. 정적 참고 추정치는 원자료 기준일·산출 근거가 검증되지 않았습니다.
      </p>
      {data.warnings.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#B7791F' }}>
          {data.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </section>
  );
}
