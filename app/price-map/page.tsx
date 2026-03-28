'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Header from '@/components/layout/Header';
import KoreaMap from '@/components/price-map/KoreaMap';
import MapLegend from '@/components/price-map/MapLegend';
import SummaryBox from '@/components/price-map/SummaryBox';
import ToggleGroup from '@/components/price-map/ToggleGroup';
import type { PriceChangeData, TradeType, PeriodType, RegionChange } from '@/types/price-map';

const TRADE_OPTIONS = [
  { label: '매매', value: 'sale' as TradeType },
  { label: '전세', value: 'rent' as TradeType },
];

const PERIOD_OPTIONS = [
  { label: '주간', value: 'weekly' as PeriodType },
  { label: '월간', value: 'monthly' as PeriodType },
];

function PriceMapContent() {
  const [tradeType, setTradeType] = useState<TradeType>('sale');
  const [period, setPeriod] = useState<PeriodType>('weekly');
  const [data, setData] = useState<PriceChangeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<RegionChange | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchData = useCallback(async (type: TradeType, p: PeriodType) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/price-change?type=${type}&period=${p}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch {
      // 기존 데이터 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(tradeType, period);
  }, [tradeType, period, fetchData]);

  // 모바일: 리스트 뷰 정렬
  const sortedRegions = data
    ? [...data.regions].sort((a, b) => b.change_rate - a.change_rate)
    : [];

  return (
    <main style={{ paddingTop: '64px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 20px' }}>

        {/* 헤더 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          justifyContent: 'space-between', gap: '16px', marginBottom: '24px',
        }}>
          <div>
            <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: '#F1F5F9', marginBottom: '4px' }}>
              매매/전세 변동률 지도
            </h1>
            <p style={{ fontSize: '13px', color: '#64748B' }}>
              시도별 아파트 가격 변동률 현황
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <ToggleGroup options={TRADE_OPTIONS} selected={tradeType} onChange={setTradeType} />
            <ToggleGroup options={PERIOD_OPTIONS} selected={period} onChange={setPeriod} />
          </div>
        </div>

        {/* 요약 */}
        {data && (
          <SummaryBox
            period={data.period}
            nationwide={data.summary.nationwide}
            capitalArea={data.summary.capital_area}
            nonCapital={data.summary.non_capital}
          />
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748B', fontSize: '14px' }}>
            불러오는 중...
          </div>
        )}

        {!loading && data && (
          <div style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row',
            gap: '28px', alignItems: isMobile ? 'center' : 'flex-start',
          }}>
            {/* 지도 */}
            <div style={{ flex: isMobile ? 'unset' : '1', width: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <KoreaMap regions={data.regions} onRegionClick={setSelectedRegion} />
              <div style={{ marginTop: '16px' }}>
                <MapLegend />
              </div>
            </div>

            {/* 우측: 랭킹 테이블 */}
            <div style={{ flex: isMobile ? 'unset' : '1', width: '100%' }}>
              {/* 선택된 지역 상세 */}
              {selectedRegion && (
                <div style={{
                  padding: '16px', borderRadius: '12px', marginBottom: '16px',
                  backgroundColor: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}>
                  <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>선택 지역</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: '#F1F5F9' }}>
                      {selectedRegion.name}
                    </span>
                    <span style={{
                      fontSize: '20px', fontWeight: 700,
                      fontFamily: 'Roboto Mono, monospace',
                      color: selectedRegion.change_rate >= 0 ? '#F87171' : '#60A5FA',
                    }}>
                      {selectedRegion.change_rate >= 0 ? '+' : ''}{selectedRegion.change_rate.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {/* 랭킹 테이블 */}
              <div style={{
                borderRadius: '14px', overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '50px 1fr 100px',
                  padding: '10px 16px', backgroundColor: 'rgba(255,255,255,0.03)',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>순위</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>시도</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', textAlign: 'right' }}>변동률</span>
                </div>
                {sortedRegions.map((r, i) => (
                  <div
                    key={r.code}
                    onClick={() => setSelectedRegion(r)}
                    style={{
                      display: 'grid', gridTemplateColumns: '50px 1fr 100px',
                      padding: '10px 16px',
                      backgroundColor: selectedRegion?.code === r.code
                        ? 'rgba(59,130,246,0.08)'
                        : i % 2 === 0
                          ? 'rgba(255,255,255,0.01)'
                          : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#94A3B8' }}>{i + 1}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>{r.name}</span>
                    <span style={{
                      fontSize: '13px', fontWeight: 700, textAlign: 'right',
                      fontFamily: 'Roboto Mono, monospace',
                      color: r.change_rate >= 0 ? '#F87171' : '#60A5FA',
                    }}>
                      {r.change_rate >= 0 ? '▲' : '▼'} {Math.abs(r.change_rate).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PriceMapPage() {
  return (
    <>
      <Header />
      <Suspense fallback={
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', color: 'var(--text-dim)', paddingTop: '64px' }}>
          로딩 중...
        </div>
      }>
        <PriceMapContent />
      </Suspense>
    </>
  );
}
