import { Suspense } from 'react';
import './report.css';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { getLatestReport } from '@/lib/report/get-report';
import ReportHero from './components/ReportHero';
import PullQuote from './components/PullQuote';
import CardDeck from './components/CardDeck';
import CommentaryBody from './components/CommentaryBody';
import NotableDeals from './components/NotableDeals';
import Details from './components/Details';
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
    <>
      <ReportHero
        title={report.title}
        subtitle={report.subtitle}
        generatedAt={report.generatedAt}
        dateRange={report.dateRange}
      />

      {report.commentary && (
        <PullQuote text={report.commentary.pullquote} />
      )}

      <CardDeck
        topYearHighs={report.topYearHighs}
        byRegion={report.byRegion}
      />

      {report.commentary && (
        <CommentaryBody paragraphs={report.commentary.paragraphs} />
      )}

      {report.notableDeals && report.notableDeals.length > 0 && (
        <NotableDeals
          deals={report.notableDeals}
          threshold={report.notableThreshold}
        />
      )}

      <Details
        byRegion={report.byRegion}
        topYearHighs={report.topYearHighs}
      />

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '0 24px clamp(32px, 6vw, 64px)' }}>
        <ReportDisclaimer disclaimer={report.disclaimer} />
      </div>
    </>
  );
}
