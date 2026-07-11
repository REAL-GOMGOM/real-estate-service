'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import ApartmentSelector from '@/components/chart/ApartmentSelector';
import PriceChart from '@/components/chart/PriceChart';
import ErrorState from '@/components/common/ErrorState';
import { AptAutocomplete, type ApartmentSearchResult } from '@/components/search/AptAutocomplete';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import mockTransactions from '@/data/apartment-transactions.json';

const TransactionTable = dynamic(
  () => import('@/components/chart/TransactionTable'),
  { ssr: false }
);

// 실거래 데이터 형태 (목업 JSON · /api/transactions 응답 공통)
interface TxRecord {
  id?: string;
  area: number;
  floor: number;
  price: number;
  pricePerArea: number;
  date: string;
  dealType?: string;
}
interface ApartmentRecord {
  id: string;
  name: string;
  district: string;
  address?: string;
  areas?: number[];
  transactions: TxRecord[];
}

const MOCK_DATA: ApartmentRecord[] = mockTransactions;

const PERIOD_OPTIONS = [
  { label: '3개월', months: 3  },
  { label: '6개월', months: 6  },
  { label: '9개월', months: 9  },
  { label: '1년',   months: 12 },
];

// 단지명 전국 검색 대상 — 주요 서울/경기 구 (불변 상수라 모듈 스코프)
const SEARCH_DISTRICTS = [
  '강남구', '서초구', '송파구', '용산구', '마포구', '성동구',
  '영등포구', '양천구', '강동구', '광진구', '동작구',
  '성남시 분당구', '과천시', '하남시', '용인시 수지구',
];

function ChartContent() {
  const searchParams  = useSearchParams();
  const districtParam = searchParams.get('district');

  const [selectedPeriod, setSelectedPeriod] = useState(12);
  const [selectedId,     setSelectedId]     = useState<string>(MOCK_DATA[0].id);
  const [selectedArea,   setSelectedArea]   = useState<number | 'all'>('all');
  const [apiData,        setApiData]        = useState<ApartmentRecord[] | null>(null);
  const [isLoading,      setIsLoading]      = useState(false);
  const [apiError,       setApiError]       = useState<string | null>(null);
  const [activeDistrict, setActiveDistrict] = useState<string>(districtParam ?? '강남구');
  const [isMobile,       setIsMobile]       = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchApiData = useCallback(async (district: string, months: number) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const res  = await fetch(`/api/transactions?district=${encodeURIComponent(district)}&months=${months}`);
      const json = await res.json();

      if (json.error) {
        if (json.error.includes('지원하지 않는')) {
          setApiError(`"${district}"은(는) 아직 지원하지 않는 지역입니다. 구를 직접 선택해주세요.`);
          setApiData(null);
          return;
        }
        throw new Error(json.error);
      }

      setApiData(json.data);
      if (json.data.length > 0) setSelectedId(json.data[0].id);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
      setApiData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 단지명 전국 검색 — SEARCH_DISTRICTS(모듈 상수)에 병렬 호출
  const searchByAptName = useCallback(async (aptName: string) => {
    if (aptName.length < 2) return;
    setIsLoading(true);
    setApiError(null);
    try {
      const results = await Promise.all(
        SEARCH_DISTRICTS.map((d) =>
          fetch(`/api/transactions?district=${encodeURIComponent(d)}&months=12&aptName=${encodeURIComponent(aptName)}`)
            .then((r) => r.json())
            .then((j) => j.data ?? [])
            .catch(() => [])
        )
      );
      const merged = results.flat();
      setApiData(merged.length > 0 ? merged : []);
      if (merged.length > 0) {
        setActiveDistrict(merged[0].district);
        setSelectedId(merged[0].id);
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 마운트 + districtParam 변경 시 호출
  useEffect(() => {
    const district = districtParam ?? '강남구';
    setActiveDistrict(district);
    fetchApiData(district, selectedPeriod);
    // 의도: districtParam 변경에만 반응. selectedPeriod 를 deps에 넣으면
    // 기간 변경 시 아래 전용 효과와 이중 fetch 발생. fetchApiData 는 useCallback([]) 안정.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtParam]);

  // 기간 변경 시 재호출
  useEffect(() => {
    fetchApiData(activeDistrict, selectedPeriod);
    // 의도: selectedPeriod 변경에만 반응. activeDistrict 를 deps에 넣으면
    // 단지 검색(setActiveDistrict) 직후 재fetch가 검색 결과를 덮어쓰는 회귀 발생.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const sourceData = apiData ?? MOCK_DATA;

  const apartments = useMemo(() => {
    return sourceData.map((apt) => {
      const txSorted = [...apt.transactions].sort((a, b) =>
        b.date.localeCompare(a.date)
      );
      const latest = txSorted[0]?.price ?? 0;
      const prev   = txSorted[txSorted.length - 1]?.price ?? latest;
      const change = prev > 0 ? ((latest - prev) / prev) * 100 : 0;
      return {
        id:          apt.id,
        name:        apt.name,
        district:    apt.district,
        address:     apt.address ?? apt.district,
        areas:       apt.areas ?? [],
        latestPrice: latest,
        priceChange: change,
      };
    });
  }, [sourceData]);

  const selectedApt = useMemo(
    () => sourceData.find((a) => a.id === selectedId),
    [sourceData, selectedId]
  );

  const filteredTx = useMemo(() => {
    if (!selectedApt) return [];
    return selectedArea === 'all'
      ? selectedApt.transactions
      : selectedApt.transactions.filter((t) => t.area === selectedArea);
  }, [selectedApt, selectedArea]);

  const monthlyData = useMemo(() => {
    const grouped: Record<string, { prices: number[]; count: number }> = {};
    filteredTx.forEach((t) => {
      if (!grouped[t.date]) grouped[t.date] = { prices: [], count: 0 };
      grouped[t.date].prices.push(t.price);
      grouped[t.date].count++;
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { prices, count }]) => ({
        date,
        avgPrice: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length),
        minPrice: Math.min(...prices),
        count,
      }));
  }, [filteredTx]);

  const stats = useMemo(() => {
    if (filteredTx.length === 0) return null;
    const sorted   = [...filteredTx].sort((a, b) => b.date.localeCompare(a.date));
    const latest   = sorted[0].price;
    const prev     = sorted[1]?.price ?? latest;
    const change   = ((latest - prev) / prev) * 100;
    const maxPrice = Math.max(...filteredTx.map((t) => t.price));
    const minPrice = Math.min(...filteredTx.map((t) => t.price));
    return { latest, change, maxPrice, minPrice, count: filteredTx.length };
  }, [filteredTx]);

  const fmt = (v: number) => `${(v / 10000).toFixed(1)}억`;

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', paddingTop: '64px' }}>
      <ApartmentSelector
        apartments={apartments}
        selectedId={selectedId}
        selectedArea={selectedArea}
        activeDistrict={activeDistrict}
        onSelect={(id) => { setSelectedId(id); setSelectedArea('all'); }}
        onAreaChange={setSelectedArea}
        onDistrictChange={(d) => { setActiveDistrict(d); fetchApiData(d, selectedPeriod); }}
        onAptSearch={searchByAptName}
        isMobile={isMobile}
      />

      <main style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', height: isMobile ? 'auto' : 'calc(100vh - 64px)', backgroundColor: 'var(--bg-primary)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 28px' }}>

          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            단지별 실거래가 추이를 차트로 확인하세요. 이동평균, 거래량, 면적별 비교가 가능합니다. 출처: 국토교통부
          </p>

          <div style={{ marginBottom: '24px' }}>
            <AptAutocomplete
              placeholder="단지명 입력 (예: 잠실엘스)"
              onSelect={(apt: ApartmentSearchResult) => {
                const d = findDistrictByLawdCd(apt.lawdCd) ?? apt.sigungu;
                setActiveDistrict(d);
                fetchApiData(d, selectedPeriod);
              }}
            />
          </div>

          {/* 기간 필터 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.months}
                  onClick={() => setSelectedPeriod(opt.months)}
                  style={{
                    padding: '8px 16px', borderRadius: '10px',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: 'none',
                    backgroundColor: selectedPeriod === opt.months ? 'var(--accent)' : 'var(--border-light)',
                    color: selectedPeriod === opt.months ? 'white' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isLoading && (
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>데이터 불러오는 중...</span>
              )}
              {apiError && (
                <span style={{ fontSize: '12px', color: '#E23B3B' }}>API 오류: {apiError}</span>
              )}
              <span style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                backgroundColor: apiData ? 'rgba(111,192,138,0.12)' : 'var(--border-light)',
                color: apiData ? '#2E7A4C' : 'var(--text-dim)',
                border: `1px solid ${apiData ? 'rgba(111,192,138,0.25)' : 'var(--border-light)'}`,
              }}>
                {apiData ? `${activeDistrict} 실거래가` : '목업 데이터'}
              </span>
            </div>
          </div>

          {/* API 에러 — 데이터 없음 */}
          {apiError && !apiData && !isLoading && (
            <ErrorState
              message="차트 데이터를 불러오지 못했습니다"
              detail={apiError}
              onRetry={() => fetchApiData(activeDistrict, selectedPeriod)}
            />
          )}

          {/* 단지 헤더 */}
          {selectedApt && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {selectedApt.name}
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
                  {selectedApt.address ?? selectedApt.district}
                </p>
              </div>

              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                  {[
                    { label: '최근 거래가', value: fmt(stats.latest),   color: 'var(--text-primary)' },
                    { label: '전월 대비',   value: `${stats.change >= 0 ? '+' : ''}${stats.change.toFixed(1)}%`, color: stats.change >= 0 ? '#2E7A4C' : '#E23B3B' },
                    { label: '최고가',      value: fmt(stats.maxPrice), color: '#F0A24B' },
                    { label: '최저가',      value: fmt(stats.minPrice), color: 'var(--text-muted)' },
                    { label: '총 거래',     value: `${stats.count}건`,  color: 'var(--accent)' },
                  ].map((s) => (
                    <div key={s.label} style={{
                      padding: '16px 18px', borderRadius: '14px',
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                    }}>
                      <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px' }}>{s.label}</p>
                      <p style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: s.color }}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <PriceChart data={monthlyData} />
          </div>

          {filteredTx.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px' }}>
                거래 내역 ({filteredTx.length}건)
              </p>
              <TransactionTable transactions={filteredTx} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ChartPage() {
  return (
    <>
      <Header />
      <Suspense fallback={
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 500 }}>불러오는 중...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }>
        <ChartContent />
      </Suspense>
    </>
  );
}
