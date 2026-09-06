// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModerationQueue } from '../ModerationQueue';
import type { AdminFieldReport } from '@/lib/field-reports/types';

vi.mock('../actions', () => ({ moderateFieldReportAction: vi.fn() }));

const CHECKED_AT = Date.parse('2026-08-31T12:00:00.000Z');
let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

async function renderAllReports(reports: AdminFieldReport[]) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<ModerationQueue reports={reports} checkedAt={CHECKED_AT} />));
  const allButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === `전체 ${reports.length}`)!;
  await act(async () => allButton.click());
  return host;
}

function reportFixture(overrides: Partial<AdminFieldReport> = {}): AdminFieldReport {
  return {
    id: 'de6ef87a-7d20-4daa-b62f-5b1fb4e3b0a1',
    apartmentId: 'test-apartment',
    apartmentName: '검수 대기 단지',
    sido: '서울특별시',
    sigungu: '강남구',
    dong: '역삼동',
    area: 84,
    tradeType: 'sale',
    price: 100000,
    monthlyRent: null,
    contractDate: '2026-08-30',
    source: 'participant',
    createdAt: '2026-08-31T00:00:00.000Z',
    publishedAt: null,
    status: 'pending',
    expiresAt: '2026-09-30T00:00:00.000Z',
    flaggedAt: null,
    flagReason: null,
    ...overrides,
  };
}

describe('moderation queue rendering', () => {
  it('shows pending and flagged reports by default, not unrelated published reports', () => {
    const html = renderToStaticMarkup(
      <ModerationQueue checkedAt={CHECKED_AT} reports={[
        reportFixture(),
        reportFixture({ id: 'flagged', apartmentName: '신고된 단지', status: 'published', flaggedAt: '2026-08-31T01:00:00.000Z', flagReason: 'personal_information' }),
        reportFixture({ id: 'published', apartmentName: '이미 게시한 단지', status: 'published' }),
      ]} />,
    );
    expect(html).toContain('검수 대기 단지');
    expect(html).toContain('신고된 단지');
    expect(html).not.toContain('이미 게시한 단지');
    expect(html).toContain('개인정보 포함');
    expect(html).toContain('소식 출처 (직접 선택)');
    expect(html).toContain('현장 제보');
    expect(html).not.toContain('미확인 현장 제보');
    expect(html).toContain('신고된 제보는 확인 후 숨김 처리할 수 있습니다.');
  });

  it('disables publication when the report has expired', () => {
    const html = renderToStaticMarkup(
      <ModerationQueue checkedAt={CHECKED_AT} reports={[reportFixture({ expiresAt: '2026-08-31T12:00:00.000Z' })]} />,
    );
    expect(html).toMatch(/<button[^>]*value="published"[^>]*disabled=""/);
    expect(html).toContain('만료된 제보는 다시 게시할 수 없습니다.');
  });

  it('does not disable publication for a fresh pending report', () => {
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[reportFixture()]} />);
    const publicationButton = html.match(/<button[^>]*value="published"[^>]*>/)?.[0];
    expect(publicationButton).toBeDefined();
    expect(publicationButton).not.toContain('disabled=""');
  });

  it.each([
    ['anonymous', '익명'],
    ['field_news', '현장소식'],
  ] as const)('renders the new self-described source %s as %s', (source, label) => {
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[reportFixture({ source })]} />);
    expect(html).toContain(label);
  });

  it('renders a genuine empty state without example transactions', () => {
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[]} />);
    expect(html).toContain('현재 검수 대기 또는 신고된 제보가 없습니다.');
    expect(html).not.toContain('<article');
    expect(html).not.toContain('value="published"');
  });

  it('removes a hidden flagged report from the unresolved queue', () => {
    const html = renderToStaticMarkup(
      <ModerationQueue checkedAt={CHECKED_AT} reports={[reportFixture({
        status: 'hidden', flaggedAt: '2026-08-31T01:00:00.000Z', flagReason: 'duplicate',
      })]} />,
    );
    expect(html).toContain('현재 검수 대기 또는 신고된 제보가 없습니다.');
    expect(html).not.toContain('<article');
  });

  it('escapes apartment names rather than interpreting user-supplied HTML', () => {
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[reportFixture({ apartmentName: '<script>private()</script>' })]} />);
    expect(html).toContain('&lt;script&gt;private()&lt;/script&gt;');
    expect(html).not.toContain('<script>private()');
  });

  it('does not mislabel missing flag fields on a pending report as a received complaint', () => {
    const report = reportFixture({ flaggedAt: undefined, flagReason: undefined });
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[report]} />);
    expect(html).not.toContain('신고 접수');
    expect(html).not.toContain('신고 사유:');
    expect(html).not.toContain('신고 시각:');
    expect(html.match(/<button[^>]*value="published"[^>]*>/)?.[0]).not.toContain('disabled=""');
  });

  it('does not add a published report with missing flags to the review queue', () => {
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[
      reportFixture({ status: 'published', flaggedAt: undefined, flagReason: undefined }),
    ]} />);
    expect(html).toContain('현재 검수 대기 또는 신고된 제보가 없습니다.');
    expect(html).not.toContain('<article');
  });

  it('keeps a reason-only complaint in the queue and disables publication', () => {
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[
      reportFixture({ status: 'published', flaggedAt: undefined, flagReason: 'duplicate' }),
    ]} />);
    expect(html).toContain('신고 접수');
    expect(html).toContain('신고 사유: 중복 제보');
    expect(html).toContain('신고 시각: 확인 필요');
    expect(html).not.toContain('1970');
    expect(html.match(/<button[^>]*value="published"[^>]*>/)?.[0]).toContain('disabled=""');
  });

  it.each([
    { flaggedAt: null, flagReason: null },
    { flaggedAt: undefined, flagReason: undefined },
  ])('allows an unflagged hidden report to be explicitly republished from all reports: %j', async (flags) => {
    const report = reportFixture({ status: 'hidden', ...flags });
    const html = renderToStaticMarkup(<ModerationQueue checkedAt={CHECKED_AT} reports={[report]} />);
    expect(html).not.toContain('<article');

    const content = await renderAllReports([report]);
    const publicationButton = content.querySelector<HTMLButtonElement>('button[name="status"][value="published"]')!;
    expect(publicationButton.textContent).toBe('다시 게시');
    expect(publicationButton.disabled).toBe(false);
    expect(content.textContent).not.toContain('신고 접수');
    expect(content.querySelector<HTMLButtonElement>('button[value="rejected"]')!.disabled).toBe(true);
    expect(content.querySelector<HTMLButtonElement>('button[value="hidden"]')!.disabled).toBe(true);

    const queueButton = [...content.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === '검수 대기·신고 0')!;
    await act(async () => queueButton.click());
    expect(content.querySelector('article')).toBeNull();
  });

  it.each([
    { status: 'hidden', flaggedAt: '2026-08-31T01:00:00.000Z', flagReason: 'duplicate' },
    { status: 'hidden', flaggedAt: undefined, flagReason: 'personal_information' },
    { status: 'hidden', flaggedAt: 'invalid-timestamp', flagReason: null },
    { status: 'hidden', expiresAt: '2026-08-31T12:00:00.000Z' },
    { status: 'rejected' },
  ] satisfies Partial<AdminFieldReport>[])('keeps unsafe or final-state republication disabled: %j', async (overrides) => {
    const content = await renderAllReports([reportFixture(overrides)]);
    expect(content.querySelector<HTMLButtonElement>('button[value="published"]')!.disabled).toBe(true);
  });

  it('does not allow rejection to be bypassed by hiding and then republishing', async () => {
    const content = await renderAllReports([reportFixture({ status: 'rejected' })]);
    expect(content.querySelector<HTMLButtonElement>('button[value="hidden"]')!.disabled).toBe(true);
  });

  it('keeps the field-report name separate from an actual received complaint', async () => {
    const content = await renderAllReports([
      reportFixture({ id: 'ordinary', apartmentName: '일반 제보 단지', status: 'published' }),
      reportFixture({ id: 'flagged', apartmentName: '실제 신고 단지', status: 'published', flaggedAt: '2026-08-31T01:00:00.000Z', flagReason: 'personal_information' }),
    ]);
    const ordinary = content.querySelector('article[aria-labelledby="report-ordinary"]')!;
    const flagged = content.querySelector('article[aria-labelledby="report-flagged"]')!;
    for (const card of [ordinary, flagged]) {
      expect([...card.querySelectorAll('span')].some((span) => span.textContent === '현장 제보')).toBe(true);
      expect(card.textContent).not.toContain('미확인 현장 제보');
    }
    expect(ordinary.textContent).not.toContain('신고 접수');
    expect(ordinary.textContent).not.toContain('신고 사유:');
    expect(flagged.textContent).toContain('신고 접수');
    expect(flagged.textContent).toContain('신고 사유: 개인정보 포함');
    expect(flagged.textContent).toContain('신고 시각:');
    expect(flagged.querySelector<HTMLButtonElement>('button[value="published"]')!.disabled).toBe(true);
    expect(flagged.querySelector<HTMLButtonElement>('button[value="hidden"]')!.disabled).toBe(false);
  });
});
