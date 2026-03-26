'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import ApartmentSelector from '@/components/chart/ApartmentSelector';
import PriceChart from '@/components/chart/PriceChart';

const TransactionTable = dynamic(
  () => import('@/components/chart/TransactionTable'),
  { ssr: false }
);

const MOCK_DATA = require('@/data/apartment-transactions.json');

const PERIOD_OPTIONS = [
  { label: '3개월', months: 3  },
  { label: '6개월', months: 6  },
  { label: '9개월', months: 9  },
  { label: '1년',   months: 12 },
];

function ChartContent() {
  const searchParams  = useSearchParams();
  const districtParam = searchParams.get('district');

  const [selectedPeriod, setSelectedPeriod] = useState(12);
  const [selectedId,     setSelectedId]     = useState<string>(MOCK_DATA[0].id);
  const [selectedArea,   setSelectedArea]   = useState<number | 'all'>('all');
  const [apiData,        setApiData]        = useState<any[] | null>(null);
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
          setActiveDistrict('강남구');
          const fallbackRes  = await fetch(`/api/transactions?district=강남구&months=${months}`);
          const fallbackJson = await fallbackRes.json();
          if (fallbackJson.data?.length > 0) {
            setApiData(fallbackJson.data);
            setSelectedId(fallbackJson.data[0].id);
          }
          return;
        }
        throw new Error(json.error);
      }

      setApiData(json.data);
      if (json.data.length > 0) setSelectedId(json.data[0].id);
    } catch (e: any) {
      setApiError(e.message);
      setApiData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 단지명 전국 검색 — 주요 서울/경기 구에 병렬 호출
  const SEARCH_DISTRICTS = [
    '강남구', '서초구', '송파구', '용산구', '마포구', '성동구',
    '영등포구', '양천구', '강동구', '광진구', '동작구',
    '성남시 분당구', '과천시', '하남시', '용인시 수지구',
  ];

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
    } catch (e: any) {
      setApiError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 마운트 + districtParam 변경 시 호출
  useEffect(() => {
    const district = districtParam ?? '강남구';
    setActiveDistrict(district);
    fetchApiData(district, selectedPeriod);
  }, [districtParam]);

  // 기간 변경 시 재호출
  useEffect(() => {
    fetchApiData(activeDistrict, selectedPeriod);
  }, [selectedPeriod]);

  const sourceData = apiData ?? MOCK_DATA;

  const apartments = useMemo(() => {
    return sourceData.map((apt: any) => {
      const txSorted = [...apt.transactions].sort((a: any, b: any) =>
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
    () => sourceData.find((a: any) => a.id === selectedId),
    [sourceData, selectedId]
  );

  const filteredTx = useMemo(() => {
    if (!selectedApt) return [];
    return selectedArea === 'all'
      ? selectedApt.transactions
      : selectedApt.transactions.filter((t: any) => t.area === selectedArea);
  }, [selectedApt, selectedArea]);

  const monthlyData = useMemo(() => {
    const grouped: Record<string, { prices: number[]; count: number }> = {};
    filteredTx.forEach((t: any) => {
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
    const sorted   = [...filteredTx].sort((a: any, b: any) => b.date.localeCompare(a.date));
    const latest   = sorted[0].price;
    const prev     = sorted[1]?.price ?? latest;
    const change   = ((latest - prev) / prev) * 100;
    const maxPrice = Math.max(...filteredTx.map((t: any) => t.price));
    const minPrice = Math.min(...filteredTx.map((t: any) => t.price));
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

      <main style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', height: isMobile ? 'auto' : 'calc(100vh - 64px)', backgroundColor: '#0A0E1A' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 28px' }}>

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
                    backgroundColor: selectedPeriod === opt.months ? '#3B82F6' : 'rgba(255,255,255,0.06)',
                    color: selectedPeriod === opt.months ? 'white' : '#94A3B8',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isLoading && (
                <span style={{ fontSize: '12px', color: '#64748B' }}>데이터 불러오는 중...</span>
              )}
              {apiError && (
                <span style={{ fontSize: '12px', color: '#EF4444' }}>API 오류: {apiError}</span>
              )}
              <span style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '11px',
                backgroundColor: apiData ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                color: apiData ? '#22C55E' : '#475569',
                border: `1px solid ${apiData ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)'}`,
              }}>
                {apiData ? `${activeDistrict} 실거래가` : '목업 데이터'}
              </span>
            </div>
          </div>

          {/* 단지 헤더 */}
          {selectedApt && (
            <div style={{ marginBottom: '28px' }}>
              <div style={{ marginBottom: '20px' }}>
                <h1 style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, color: '#F1F5F9', marginBottom: '4px' }}>
                  {selectedApt.name}
                </h1>
                <p style={{ fontSize: '13px', color: '#64748B' }}>
                  {selectedApt.address ?? selectedApt.district}
                </p>
              </div>

              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                  {[
                    { label: '최근 거래가', value: fmt(stats.latest),   color: '#F1F5F9' },
                    { label: '전월 대비',   value: `${stats.change >= 0 ? '+' : ''}${stats.change.toFixed(1)}%`, color: stats.change >= 0 ? '#22C55E' : '#EF4444' },
                    { label: '최고가',      value: fmt(stats.maxPrice), color: '#F59E0B' },
                    { label: '최저가',      value: fmt(stats.minPrice), color: '#94A3B8' },
                    { label: '총 거래',     value: `${stats.count}건`,  color: '#3B82F6' },
                  ].map((s) => (
                    <div key={s.label} style={{
                      padding: '16px 18px', borderRadius: '14px',
                      backgroundColor: '#0F1629',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}>
                      <p style={{ fontSize: '11px', color: '#64748B', marginBottom: '6px' }}>{s.label}</p>
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
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8', marginBottom: '12px' }}>
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
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0E1A', color: '#475569' }}>
          로딩 중...
        </div>
      }>
        <ChartContent />
      </Suspense>
    </>
  );
}
