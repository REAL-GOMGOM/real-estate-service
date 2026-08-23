'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Header from '@/components/layout/Header';
import KoreaMap from '@/components/price-map/KoreaMap';
import MapLegend from '@/components/price-map/MapLegend';
import SummaryBox from '@/components/price-map/SummaryBox';
import ToggleGroup from '@/components/price-map/ToggleGroup';
import { isMonthlyPriceChangeData, PRICE_CHANGE_FREQUENCY } from '@/lib/price-map-contract';
import type { PriceChangeData, TradeType, RegionChange } from '@/types/price-map';

const TRADE_OPTIONS = [
  { label: '매매', value: 'sale' as TradeType },
  { label: '전세', value: 'rent' as TradeType },
];

function PriceMapContent() {
  const [tradeType, setTradeType] = useState<TradeType>('sale');
  const [data, setData] = useState<PriceChangeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedRegion, setSelectedRegion] = useState<RegionChange | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchData = useCallback(async (type: TradeType, signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    setData(null);
    setSelectedRegion(null);
    try {
      const res = await fetch(
        `/api/price-change?type=${type}&period=${PRICE_CHANGE_FREQUENCY}`,
        { signal },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : '월간 변동률을 불러오지 못했습니다.');
      }
      if (!isMonthlyPriceChangeData(json)) {
        throw new Error('월간 변동률 응답 형식이 올바르지 않습니다.');
      }
      if (json.regions.length === 0) {
        throw new Error('표시할 월간 변동률 데이터가 없습니다.');
      }
      if (!signal.aborted) setData(json);
    } catch (caught) {
      if (signal.aborted) return;
      setError(caught instanceof Error ? caught.message : '월간 변동률을 불러오지 못했습니다.');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(tradeType, controller.signal);
    return () => controller.abort();
  }, [tradeType, retryKey, fetchData]);

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
            <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
              매매/전세 변동률 지도
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              시도별 아파트 매매·전세 가격 변동률을 지도에서 확인합니다. 출처: 한국부동산원
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <ToggleGroup options={TRADE_OPTIONS} selected={tradeType} onChange={setTradeType} />
            <div
              aria-label="집계 주기: 월간"
              style={{
                display: 'inline-flex', alignItems: 'center', padding: '8px 18px',
                borderRadius: '10px', border: '1px solid var(--border)',
                backgroundColor: 'var(--accent)', color: '#FFFFFF',
                fontSize: '13px', fontWeight: 600,
              }}
            >
              월간
            </div>
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
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
            불러오는 중...
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            style={{
              marginTop: '20px', padding: '36px 20px', textAlign: 'center',
              borderRadius: '14px', border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)',
            }}
          >
            <p style={{ marginBottom: '14px', fontSize: '14px' }}>{error}</p>
            <button
              type="button"
              onClick={() => setRetryKey((key) => key + 1)}
              style={{
                padding: '9px 16px', borderRadius: '9px', border: 'none',
                backgroundColor: 'var(--accent)', color: '#FFFFFF',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && data && (
          <div style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'row',
            gap: '24px', alignItems: isMobile ? 'center' : 'flex-start',
          }}>
            {/* 지도 */}
            <div style={{
              flex: isMobile ? 'unset' : '5',
              width: isMobile ? '100%' : 'auto',
              minHeight: isMobile ? '400px' : '550px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <KoreaMap regions={data.regions} onRegionClick={setSelectedRegion} tradeType={tradeType} />
              <div style={{ marginTop: '16px' }}>
                <MapLegend />
              </div>
            </div>

            {/* 랭킹 테이블 */}
            <div style={{ flex: isMobile ? 'unset' : '3', width: '100%' }}>
              {/* 선택된 지역 상세 */}
              {selectedRegion && (
                <div style={{
                  padding: '16px', borderRadius: '12px', marginBottom: '16px',
                  backgroundColor: 'var(--accent-bg)',
                  border: '1px solid var(--accent-border)',
                }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '4px' }}>선택 지역</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {selectedRegion.name}
                    </span>
                    <span style={{
                      fontSize: '20px', fontWeight: 700,
                      fontFamily: 'Roboto Mono, monospace',
                      color: selectedRegion.change_rate >= 0 ? '#E85D5D' : 'var(--accent)',
                    }}>
                      {selectedRegion.change_rate >= 0 ? '+' : ''}{selectedRegion.change_rate.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              {/* 랭킹 테이블 */}
              <div style={{
                borderRadius: '14px', overflow: 'hidden',
                border: '1px solid var(--border-light)',
              }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: '50px 1fr 100px',
                  padding: '10px 16px', backgroundColor: 'var(--border-light)',
                  borderBottom: '1px solid var(--border-light)',
                }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)' }}>순위</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)' }}>시도</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-dim)', textAlign: 'right' }}>변동률</span>
                </div>
                {sortedRegions.map((r, i) => (
                  <div
                    key={r.code}
                    onClick={() => setSelectedRegion(r)}
                    style={{
                      display: 'grid', gridTemplateColumns: '50px 1fr 100px',
                      padding: '10px 16px',
                      backgroundColor: selectedRegion?.code === r.code
                        ? 'var(--accent-bg)'
                        : i % 2 === 0
                          ? 'var(--bg-overlay)'
                          : 'transparent',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>{i + 1}</span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</span>
                    <span style={{
                      fontSize: '13px', fontWeight: 700, textAlign: 'right',
                      fontFamily: 'Roboto Mono, monospace',
                      color: r.change_rate >= 0 ? '#E85D5D' : 'var(--accent)',
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
        <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-primary)', paddingTop: '64px', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 500 }}>불러오는 중...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }>
        <PriceMapContent />
      </Suspense>
    </>
  );
}
