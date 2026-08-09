'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/layout/Header';
import ToggleGroup from '@/components/price-map/ToggleGroup';
import RegionSelector from '@/components/price-trend/RegionSelector';
import RegionRankingTable from '@/components/price-trend/RegionRankingTable';
import { PERIOD_OPTIONS, type TrendPeriod, type PriceTrendData } from '@/types/price-trend';
import SubPageHeader from '@/components/common/SubPageHeader';

const TrendChart = dynamic(
  () => import('@/components/price-trend/TrendChart'),
  { ssr: false, loading: () => <div style={{ height: '440px', borderRadius: '14px', backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}><div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} /><p style={{ fontSize: '14px', color: 'var(--text-dim)', fontWeight: 500 }}>차트 불러오는 중...</p><style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style></div> },
);

const PERIOD_TOGGLE = PERIOD_OPTIONS.map((o) => ({ label: o.label, value: o.value }));

function PriceTrendContent() {
  const [period, setPeriod] = useState<TrendPeriod>('six_months');
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(
    () => new Set(['서울', '경기', '인천']),
  );
  const [data, setData] = useState<PriceTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchData = useCallback(async (p: TrendPeriod, regions: Set<string>) => {
    activeRequest.current?.abort();
    if (regions.size === 0) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const regionParam = Array.from(regions).join(',');
      const res = await fetch(`/api/price-trend?period=${p}&region=${encodeURIComponent(regionParam)}`, {
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok || json.status === 'degraded' || json.error) {
        throw new Error(json.error || `가격지수 API HTTP ${res.status}`);
      }
      if (json.status === 'empty') return;
      if (!['ok', 'partial'].includes(json.status) || json.frequency !== 'monthly' || !Array.isArray(json.data)) {
        throw new Error('가격지수 API 응답 형식이 올바르지 않습니다.');
      }
      setData(json);
    } catch (fetchError) {
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
      setError(fetchError instanceof Error ? fetchError.message : '가격지수를 불러오지 못했습니다.');
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => () => activeRequest.current?.abort(), []);

  useEffect(() => {
    fetchData(period, selectedRegions);
  }, [period, selectedRegions, fetchData]);

  const toggleRegion = (region: string) => {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(region)) next.delete(region);
      else next.add(region);
      return next;
    });
  };

  const regionArray = Array.from(selectedRegions);

  return (
    <main style={{ paddingTop: '64px', backgroundColor: 'var(--bg-primary)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '28px 20px' }}>
        <SubPageHeader parentLabel="변동률" parentHref="/price-map" />

        {/* 헤더 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          justifyContent: 'space-between', gap: '16px', marginBottom: '20px',
        }}>
          <div>
            <h1 style={{ fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
              아파트 매매가격지수 추이
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              월간 아파트 매매가격지수를 선택 기간의 첫 공개 월 대비 누적 변동률로 비교합니다. 출처: 한국부동산원 R-ONE
            </p>
          </div>
          <ToggleGroup options={PERIOD_TOGGLE} selected={period} onChange={setPeriod} />
        </div>

        {/* 지역 선택 */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '8px' }}>
            비교 지역 선택 (다중 선택)
          </p>
          <RegionSelector selected={selectedRegions} onToggle={toggleRegion} />
        </div>

        {selectedRegions.size === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
            비교할 지역을 1개 이상 선택해주세요
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-dim)', fontSize: '14px' }}>
            불러오는 중...
          </div>
        )}

        {!loading && error && (
          <div role="alert" style={{ textAlign: 'center', padding: '36px 20px', border: '1px solid #F2D7D5', borderRadius: '14px', background: '#FFF8F7', color: '#8A2C25' }}>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>가격지수를 잠시 불러오지 못했습니다.</p>
            <p style={{ margin: '7px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{error}</p>
            <button type="button" onClick={() => fetchData(period, selectedRegions)} style={{ marginTop: '14px', padding: '8px 14px', border: 0, borderRadius: '8px', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && selectedRegions.size > 0 && !data && (
          <div role="status" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-dim)', fontSize: '14px' }}>
            선택한 기간에 공개된 가격지수 데이터가 없습니다.
          </div>
        )}

        {!loading && data && data.data.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'column', gap: '24px',
          }}>
            {/* 차트 */}
            <TrendChart data={data.data} regions={regionArray} />

            <p style={{ margin: '-12px 0 0', fontSize: '11.5px', color: 'var(--text-dim)', lineHeight: 1.6 }}>
              기준: {data.data[0]?.date} = 0% · 월별 지수의 기준월 대비 누적 변화이며 월간 상승률 자체가 아닙니다.
            </p>

            {data.status === 'partial' && (
              <p role="status" style={{ margin: '-12px 0 0', padding: '10px 12px', borderRadius: '10px', background: '#FFF8E8', color: '#7A5A16', fontSize: '11.5px', lineHeight: 1.6 }}>
                요청 {data.coverage.requestedMonths}개월 중 {data.coverage.returnedMonths}개월이 공개·응답되어 표시 중입니다
                ({data.coverage.firstMonth}~{data.coverage.lastMonth}). 누락 월은 선으로 보간하지 않습니다.
              </p>
            )}

            {/* 랭킹 테이블 */}
            <RegionRankingTable data={data.data} regions={regionArray} />
          </div>
        )}
      </div>
    </main>
  );
}

export default function PriceTrendPage() {
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
        <PriceTrendContent />
      </Suspense>
    </>
  );
}
