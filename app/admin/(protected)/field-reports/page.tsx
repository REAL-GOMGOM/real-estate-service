import { Suspense } from 'react';
import Link from 'next/link';
import { getAdminFieldReports } from './data';
import { ModerationQueue } from './ModerationQueue';

export const metadata = {
  title: '현장 제보 검수 — 내집(My.ZIP) 어드민',
  robots: { index: false, follow: false },
};

export default function AdminFieldReportsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">현장 제보 검수</h1>
        <Link href="/field-reports" className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-900">
          공개 제보 목록 보기
        </Link>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        새 제보는 관리자 승인 후 공개됩니다. 검수 대기·신고된 제보의 개인정보, 중복, 허위 의심 내용을 살펴본 뒤 처리해주세요.
      </p>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        게시 승인은 내용 검수를 뜻하며, 거래 사실을 인증하거나 국토교통부 실거래가에 반영하는 절차가 아닙니다.
        반려·숨김은 공개 목록에서 제외됩니다. 전체 목록에서 신고가 없고 공개 기한이 남은 숨김 제보만 다시 게시할 수 있습니다.
      </div>

      <Suspense fallback={<p role="status" className="mt-8 text-sm text-slate-500">제보 검수 목록을 확인하고 있습니다.</p>}>
        <AdminFieldReportsContent />
      </Suspense>
    </main>
  );
}

async function AdminFieldReportsContent() {
  // auth() in the loader accesses request-time session data inside this Suspense.
  const result = await getAdminFieldReports();
  if (result.status === 'forbidden') {
    return (
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">관리자 권한이 필요합니다</h2>
        <p className="mt-2 text-sm text-slate-600">허용된 관리자 계정으로 로그인한 뒤 다시 확인해주세요.</p>
        <Link href="/admin/login" className="mt-4 inline-block text-sm font-medium text-slate-900 underline underline-offset-4">관리자 로그인</Link>
      </section>
    );
  }
  if (result.status === 'unavailable') {
    return (
      <section role="status" className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">제보 저장소 준비가 필요합니다</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          제보 전용 저장소가 설정되지 않았거나 일시적으로 연결할 수 없습니다. 저장소 준비와 연결 상태를 확인한 뒤 새로고침해주세요.
        </p>
        <p className="mt-2 text-xs text-slate-500">연결을 확인하기 전까지 제보 목록과 검수 버튼은 표시하지 않습니다.</p>
      </section>
    );
  }
  return <ModerationQueue reports={result.reports} checkedAt={result.checkedAt} />;
}
