'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
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
  const [period, setPeriod] = useState<TrendPeriod>('weekly');
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(
    () => new Set(['서울', '경기', '인천']),
  );
  const [data, setData] = useState<PriceTrendData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchData = useCallback(async (p: TrendPeriod, regions: Set<string>) => {
    if (regions.size === 0) { setData(null); return; }
    setLoading(true);
    try {
      const regionParam = Array.from(regions).join(',');
      const res = await fetch(`/api/price-trend?period=${p}&region=${encodeURIComponent(regionParam)}`);
      const json = await res.json();
      if (!json.error) setData(json);
    } catch {
      // 기존 데이터 유지
    } finally {
      setLoading(false);
    }
  }, []);

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
              상승률 대시보드
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              시도별 아파트 가격 변동률 추이
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

        {!loading && data && data.data.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: isMobile ? 'column' : 'column', gap: '24px',
          }}>
            {/* 차트 */}
            <TrendChart data={data.data} regions={regionArray} />

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
