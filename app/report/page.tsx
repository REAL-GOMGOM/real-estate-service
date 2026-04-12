import type { Metadata } from 'next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { getLatestReport } from '@/lib/report/get-report';
import ReportHeader from './components/ReportHeader';
import Summary from './components/Summary';
import RegionTable from './components/RegionTable';
import TopYearHighs from './components/TopYearHighs';
import ReportDisclaimer from './components/ReportDisclaimer';

export async function generateMetadata(): Promise<Metadata> {
  const report = await getLatestReport();
  return {
    title: report?.title ?? '수도권 일일 리포트 | 내집(My.ZIP)',
    description: report?.subtitle ?? '수도권 아파트 실거래 현황 리포트',
  };
}

export default async function ReportPage() {
  const report = await getLatestReport();

  if (!report) {
    return (
      <main>
        <Header />
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '80px 24px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '18px', color: 'var(--text-muted)' }}>
            리포트를 준비 중입니다.
          </p>
          <p style={{ fontSize: '14px', color: 'var(--text-dim)', marginTop: '8px' }}>
            매일 오전 8시 30분에 자동으로 생성됩니다.
          </p>
        </div>
        <Footer />
      </main>
    );
  }

  if (report.summary.totalDeals === 0) {
    return (
      <main>
        <Header />
        <div style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '80px 24px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '18px', color: 'var(--text-muted)' }}>
            최근 신고된 거래가 없습니다.
          </p>
          <div style={{ maxWidth: '640px', margin: '24px auto 0' }}>
            <ReportDisclaimer disclaimer={report.disclaimer} />
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main>
      <Header />
      <div style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: 'clamp(32px, 6vw, 64px) 24px',
      }}>
        <ReportHeader
          title={report.title}
          subtitle={report.subtitle}
          generatedAt={report.generatedAt}
        />
        <Summary {...report.summary} />
        <RegionTable byRegion={report.byRegion} />
        <TopYearHighs items={report.topYearHighs} />
        <ReportDisclaimer disclaimer={report.disclaimer} />
      </div>
      <Footer />
    </main>
  );
}
