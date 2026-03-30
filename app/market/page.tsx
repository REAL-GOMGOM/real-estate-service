import Header from '@/components/layout/Header';
import { BarChart2 } from 'lucide-react';
import SubPageHeader from '@/components/common/SubPageHeader';

export default function MarketPage() {
  return (
    <>
      <Header />
      <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <SubPageHeader parentLabel="차트" parentHref="/chart" />
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '72px', height: '72px', borderRadius: '20px',
            backgroundColor: 'var(--accent-bg)', marginBottom: '24px',
          }}>
            <BarChart2 size={36} color="var(--accent)" />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
            시세 분석
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-dim)', marginBottom: '8px' }}>
            지역별·단지별 시세 흐름 분석 페이지가 준비 중입니다.
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
            아파트 차트 탭에서 개별 단지 실거래 차트를 먼저 이용해 보세요.
          </p>
        </div>
      </main>
    </>
  );
}
