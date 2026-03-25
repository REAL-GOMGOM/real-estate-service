import Header from '@/components/layout/Header';
import { Newspaper } from 'lucide-react';

export default function NewsPage() {
  return (
    <>
      <Header />
      <main style={{ minHeight: '100vh', backgroundColor: '#0A0E1A', paddingTop: '64px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '72px', height: '72px', borderRadius: '20px',
            backgroundColor: 'rgba(59,130,246,0.12)', marginBottom: '24px',
          }}>
            <Newspaper size={36} color="#3B82F6" />
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#F1F5F9', marginBottom: '12px' }}>
            부동산 뉴스
          </h1>
          <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '8px' }}>
            부동산 관련 최신 뉴스 피드 페이지가 준비 중입니다.
          </p>
          <p style={{ fontSize: '13px', color: '#334155' }}>
            주요 정책·시장 동향을 빠르게 확인할 수 있도록 제공 예정입니다.
          </p>
        </div>
      </main>
    </>
  );
}
