'use client';

import Link from 'next/link';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Flag, MessageSquareText, Plus, TriangleAlert } from 'lucide-react';
import { reportFieldReport } from '@/app/field-reports/actions';
import type { FieldReportFlagState, PublicFieldReport } from '@/lib/field-reports/types';
import FieldReportForm from './FieldReportForm';
import { formatReportAmount, formatReportArea, formatReportPublishedDate, isPublicFieldReport, SOURCE_LABELS, TRADE_LABELS } from './presentation';
import { usePreserveFormDraft } from './usePreserveFormDraft';
import styles from './FieldReports.module.css';

type FeedState =
  | { status: 'loading' }
  | { status: 'preparing' }
  | { status: 'unavailable' }
  | { status: 'ok'; reports: PublicFieldReport[]; submissionsEnabled: boolean };

const INITIAL_FLAG_STATE: FieldReportFlagState = { status: 'idle' };

function FlagForm({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(reportFieldReport, INITIAL_FLAG_STATE);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  const selectRef = useRef<HTMLSelectElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const formRef = usePreserveFormDraft();
  useEffect(() => { selectRef.current?.focus(); }, []);
  useEffect(() => {
    if (state.status !== 'idle') statusRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} className={styles.flagForm} aria-busy={pending} aria-label="제보 신고">
      <input type="hidden" name="reportId" value={reportId} />
      {state.status === 'success' ? (
        <p role="status" tabIndex={-1} ref={statusRef}>{state.message ?? '신고가 접수되었습니다. 검토 후 조치합니다.'}</p>
      ) : (
        <>
          <label htmlFor={reasonId}>신고 사유</label>
          <select id={reasonId} ref={selectRef} name="reason" required disabled={pending} value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="" disabled>사유를 선택해주세요</option>
            <option value="false_information">허위 정보가 의심돼요</option>
            <option value="duplicate">중복 제보예요</option>
            <option value="personal_information">개인정보가 포함돼 있어요</option>
          </select>
          {state.status === 'error' ? <p role="alert" tabIndex={-1} ref={statusRef} className={styles.errorMessage}>{state.message ?? '신고를 접수하지 못했습니다. 다시 시도해주세요.'}</p> : null}
          <button type="submit" className={styles.secondaryButton} disabled={pending}>{pending ? '신고 접수 중…' : '신고 접수'}</button>
        </>
      )}
      <button type="button" className={styles.quietButton} disabled={pending} onClick={onClose}>신고 닫기</button>
    </form>
  );
}

function ReportCard({ report }: { report: PublicFieldReport }) {
  const [flagOpen, setFlagOpen] = useState(false);
  const flagButtonRef = useRef<HTMLButtonElement>(null);
  const flagId = useId();
  const formattedArea = formatReportArea(report.area);

  return (
    <article className={styles.reportCard} aria-label={`${report.apartmentName} ${TRADE_LABELS[report.tradeType]} 미확인 제보`}>
      <div className={styles.cardTop}><span className={styles.unverifiedBadge}>미확인 제보</span><span className={styles.tradeBadge}>{TRADE_LABELS[report.tradeType]}</span></div>
      <h3>{report.apartmentName}</h3>
      <p className={styles.location}>{report.sido} {report.sigungu} {report.dong}</p>
      <div className={styles.reportPrice}>
        <span>{report.tradeType === 'sale' ? '제보 매매가' : '제보 보증금'}</span>
        <strong>{formatReportAmount(report.price)}</strong>
        {report.tradeType === 'monthly' && report.monthlyRent !== null ? <p>월세 <b>{formatReportAmount(report.monthlyRent)}</b> / 월</p> : null}
      </div>
      <dl className={styles.reportDetails}>
        <div><dt>전용면적</dt><dd>{formattedArea.pyeong} <small>({formattedArea.squareMeters})</small></dd></div>
        <div><dt>제보 계약일</dt><dd><time dateTime={report.contractDate}>{report.contractDate.replaceAll('-', '.')}</time></dd></div>
      </dl>
      <div className={styles.cardFooter}>
        <span>{SOURCE_LABELS[report.source]}<small>{formatReportPublishedDate(report.publishedAt)} 공개</small></span>
        <button type="button" ref={flagButtonRef} className={styles.flagButton} aria-label={`${report.apartmentName} 제보 신고`} aria-expanded={flagOpen} aria-controls={flagId} onClick={() => setFlagOpen(true)}><Flag size={12} aria-hidden="true" />신고</button>
      </div>
      {flagOpen ? <div id={flagId}><FlagForm reportId={report.id} onClose={() => { setFlagOpen(false); flagButtonRef.current?.focus(); }} /></div> : null}
    </article>
  );
}

export default function FieldReportsHome({ expanded = false }: { expanded?: boolean }) {
  const [feed, setFeed] = useState<FeedState>({ status: 'loading' });
  const [retryKey, setRetryKey] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const prefix = useId();
  const Heading = expanded ? 'h1' : 'h2';
  const canSubmit = feed.status === 'ok' && feed.submissionsEnabled;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch('/api/field-reports', { cache: 'no-store', signal: controller.signal });
        const body = await response.json() as { status?: unknown; submissionsEnabled?: unknown; reports?: unknown };
        if (response.ok && body.status === 'preparing' && body.submissionsEnabled === false
          && Array.isArray(body.reports) && body.reports.length === 0) {
          if (active) setFeed({ status: 'preparing' });
          return;
        }
        if (!response.ok || body.status !== 'ok' || typeof body.submissionsEnabled !== 'boolean'
          || !Array.isArray(body.reports) || !body.reports.every(isPublicFieldReport)) {
          throw new Error('field reports unavailable');
        }
        if (active) setFeed({ status: 'ok', reports: body.reports, submissionsEnabled: body.submissionsEnabled });
      } catch {
        if (active) setFeed({ status: 'unavailable' });
      }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [retryKey]);

  return (
    <section className={styles.section} aria-labelledby={`${prefix}-heading`}>
      <div className={styles.inner}>
        {expanded ? <Link href="/" className={styles.homeLink}>← 내집 홈</Link> : null}
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.eyebrow}><MessageSquareText size={15} aria-hidden="true" />이웃이 전하는 계약 소식</div>
            <Heading id={`${prefix}-heading`} className={styles.title}>현장 제보가격</Heading>
            <p className={styles.description}>공식 실거래 공개 전, 이웃이 전하는 계약 소식</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" ref={triggerRef} className={styles.primaryButton} aria-expanded={formOpen} aria-controls={`${prefix}-form`} disabled={!canSubmit} onClick={() => setFormOpen(true)}><Plus size={16} aria-hidden="true" />가격 제보하기</button>
            {!expanded ? <Link href="/field-reports" className={styles.viewAll}>제보 더 보기<ArrowRight size={14} aria-hidden="true" /></Link> : null}
          </div>
        </div>
        <div className={styles.disclaimer}>
          <TriangleAlert size={17} aria-hidden="true" />
          <p><strong>공식 실거래와 별개인 미확인 정보입니다.</strong> 검수 후 공개되지만 계약 사실·가격의 진위를 보증하지 않습니다. 공식 실거래 통계에는 반영하지 않습니다.</p>
        </div>

        {formOpen && canSubmit ? <FieldReportForm id={`${prefix}-form`} onClose={() => { setFormOpen(false); triggerRef.current?.focus(); }} /> : null}

        {feed.status === 'loading' ? (
          <div className={styles.statusPanel} role="status" aria-busy="true"><p>현장 제보가격을 불러오는 중입니다.</p><div className={styles.skeleton} aria-hidden="true" /></div>
        ) : feed.status === 'preparing' ? (
          <div className={styles.emptyState} role="status">
            <span className={styles.emptyIcon}><MessageSquareText size={23} aria-hidden="true" /></span>
            <div><strong>현장 제보가격을 준비하고 있습니다.</strong><p>접수가 시작되면 이웃의 계약 소식을 제보하고 확인할 수 있습니다.</p></div>
          </div>
        ) : feed.status === 'unavailable' ? (
          <div className={styles.statusPanel} role="status">
            <strong>제보 목록을 잠시 불러오지 못했습니다.</strong>
            <p>현재 제보 접수도 이용할 수 없습니다. 잠시 후 다시 시도해주세요.</p>
            <button type="button" className={styles.secondaryButton} onClick={() => { setFeed({ status: 'loading' }); setRetryKey((value) => value + 1); }}>다시 시도</button>
          </div>
        ) : (
          <>
            {!feed.submissionsEnabled ? <p className={styles.pausedNotice} role="status">현재 제보 접수를 준비하고 있습니다. 공개된 제보는 계속 확인할 수 있습니다.</p> : null}
            {feed.reports.length === 0 ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}><MessageSquareText size={23} aria-hidden="true" /></span>
                <div><strong>아직 공개된 제보가 없습니다.</strong><p>{feed.submissionsEnabled ? '최근 체결된 계약 소식을 알려주시면, 검수 후 미확인 제보로 공개합니다.' : '제보가 접수되면 검수 후 이곳에 공개합니다.'}</p></div>
              </div>
            ) : (
              <div className={styles.reportGrid}>{feed.reports.slice(0, expanded ? 20 : 6).map((report) => <ReportCard key={report.id} report={report} />)}</div>
            )}
          </>
        )}
        <div className={styles.sectionFooter}>
          <p>소식 출처는 제보자가 직접 선택한 정보입니다. 제보는 접수 후 30일이 지나면 공개 목록에서 제외됩니다.<br />허위·중복·개인정보 포함 제보는 신고해주세요.</p>
          <div><Link href="/terms#field-reports">제보 이용 기준</Link><Link href="/privacy#field-reports">개인정보 처리 안내</Link></div>
        </div>
      </div>
    </section>
  );
}
