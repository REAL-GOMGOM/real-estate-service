'use client';

import { useActionState, useState } from 'react';
import { FIELD_REPORT_SOURCE_LABELS, FIELD_REPORT_TRADE_LABELS, hasFieldReportFlag, type AdminFieldReport } from '@/lib/field-reports/types';
import { moderateFieldReportAction, type ModerationState } from './actions';

const STATUS_LABELS: Record<AdminFieldReport['status'], string> = {
  pending: '검수 대기',
  published: '게시 중',
  rejected: '반려',
  hidden: '숨김',
};
const FLAG_LABELS = {
  false_information: '허위 정보 의심',
  duplicate: '중복 제보',
  personal_information: '개인정보 포함',
};

function formatTimestamp(value: unknown) {
  if (typeof value !== 'string') return '확인 필요';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '확인 필요';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function formatPrice(report: AdminFieldReport) {
  const amount = `${report.price.toLocaleString('ko-KR')}만원`;
  return report.tradeType === 'monthly'
    ? `보증금 ${amount} / 월 ${(report.monthlyRent ?? 0).toLocaleString('ko-KR')}만원`
    : amount;
}

export function ModerationQueue({
  reports,
  checkedAt,
}: {
  reports: AdminFieldReport[];
  checkedAt: number;
}) {
  const [view, setView] = useState<'queue' | 'all'>('queue');
  // Keep feedback outside individual cards so approval feedback survives removal
  // of the processed card from the default queue after server revalidation.
  const [state, formAction, pending] = useActionState<ModerationState, FormData>(
    moderateFieldReportAction,
    null,
  );
  const queue = reports.filter((report) => report.status === 'pending' || (report.status === 'published' && hasFieldReportFlag(report)));
  const visibleReports = view === 'queue' ? queue : reports;

  return (
    <section className="mt-8" aria-label="제보 검수 목록">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" aria-label="검수 목록 필터">
          {([
            ['queue', `검수 대기·신고 ${queue.length}`],
            ['all', `전체 ${reports.length}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 ${view === value ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">최대 100건 · 검수 대상 우선</p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {state && (
          <p
            role={state.status === 'error' ? 'alert' : 'status'}
            className={`mt-4 rounded-lg border px-4 py-3 text-sm leading-6 ${state.status === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
          >
            {state.message}
          </p>
        )}
      </div>
      {pending && <p role="status" className="mt-4 text-sm text-slate-500">검수 결과를 저장하고 있습니다.</p>}

      {visibleReports.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">{view === 'queue' ? '현재 검수 대기 또는 신고된 제보가 없습니다.' : '접수된 현장 제보가 없습니다.'}</p>
          <p className="mt-2 text-xs text-slate-500">제보가 접수되면 이곳에서 내용을 확인하고 게시 여부를 결정할 수 있습니다.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {visibleReports.map((report) => {
            const expiresAt = new Date(report.expiresAt).getTime();
            const expired = !Number.isFinite(expiresAt) || expiresAt <= checkedAt;
            const flagged = hasFieldReportFlag(report);
            const publishableStatus = report.status === 'pending' || report.status === 'hidden';
            return (
              <article key={report.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby={`report-${report.id}`}>
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">{STATUS_LABELS[report.status]}</span>
                        <span className="text-slate-500">미확인 현장 제보</span>
                        {flagged && <span className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">신고 접수</span>}
                        {expired && <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-500">공개 기한 만료</span>}
                      </div>
                      <h2 id={`report-${report.id}`} className="mt-3 break-words text-lg font-semibold text-slate-900">{report.apartmentName}</h2>
                      <p className="mt-1 text-sm text-slate-500">{[report.sido, report.sigungu, report.dong].filter(Boolean).join(' ')}</p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-slate-500">{FIELD_REPORT_TRADE_LABELS[report.tradeType]} · 전용 {report.area.toLocaleString('ko-KR')}㎡</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">{formatPrice(report)}</p>
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-slate-500">계약일 (제보 기준)</dt><dd className="mt-1 text-slate-800">{report.contractDate}</dd></div>
                    <div><dt className="text-xs text-slate-500">소식 출처 (직접 선택)</dt><dd className="mt-1 text-slate-800">{FIELD_REPORT_SOURCE_LABELS[report.source]}</dd></div>
                    <div><dt className="text-xs text-slate-500">접수 시각</dt><dd className="mt-1 text-slate-800">{formatTimestamp(report.createdAt)}</dd></div>
                    <div><dt className="text-xs text-slate-500">공개 만료 시각</dt><dd className="mt-1 text-slate-800">{formatTimestamp(report.expiresAt)}</dd></div>
                  </dl>

                  {flagged && (
                    <div className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800">
                      <p>신고 사유: {report.flagReason && Object.hasOwn(FLAG_LABELS, report.flagReason) ? FLAG_LABELS[report.flagReason] : '확인 필요'}</p>
                      <p className="text-xs">신고 시각: {formatTimestamp(report.flaggedAt)}</p>
                    </div>
                  )}
                </div>

                <form action={formAction} className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5" aria-label={`${report.apartmentName} 제보 검수`}>
                  <input type="hidden" name="id" value={report.id} />
                  <button type="submit" name="status" value="published" disabled={pending || expired || flagged || !publishableStatus} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-40">{report.status === 'hidden' ? '다시 게시' : '게시 승인'}</button>
                  <button type="submit" name="status" value="rejected" disabled={pending || report.status !== 'pending'} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-40">반려</button>
                  <button type="submit" name="status" value="hidden" disabled={pending || report.status === 'hidden' || report.status === 'rejected'} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-40">숨김</button>
                  {expired && <p className="text-xs text-slate-500">만료된 제보는 다시 게시할 수 없습니다.</p>}
                  {flagged && report.status === 'published' && <p className="text-xs text-slate-500">신고된 제보는 확인 후 숨김 처리할 수 있습니다.</p>}
                  {flagged && report.status === 'hidden' && <p className="text-xs text-slate-500">신고된 제보는 다시 게시할 수 없습니다.</p>}
                </form>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
