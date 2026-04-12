import { Suspense } from 'react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { getLatestReport } from '@/lib/report/get-report';
import ReportHeader from './components/ReportHeader';
import Summary from './components/Summary';
import RegionTable from './components/RegionTable';
import TopYearHighs from './components/TopYearHighs';
import ReportDisclaimer from './components/ReportDisclaimer';
import ReportSkeleton from './components/ReportSkeleton';
import EmptyState from './components/EmptyState';

export const metadata = {
  title: '수도권 아파트 실거래 리포트 | 내집',
  description: '국토부 신고 거래 기준 일일 리포트',
};

export default function ReportPage() {
  return (
    <>
      <Header />
      <main>
        <Suspense fallback={<ReportSkeleton />}>
          <ReportContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function ReportContent() {
  const report = await getLatestReport();

  if (!report) return <EmptyState message="리포트를 준비 중입니다" />;
  if (report.summary.totalDeals === 0) return <EmptyState message="최근 신고된 거래가 없습니다" />;

  return (
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
  );
}
