import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModerationQueue } from '../ModerationQueue';
import type { AdminFieldReport } from '@/lib/field-reports/types';

vi.mock('../actions', () => ({ moderateFieldReportAction: vi.fn() }));

const CHECKED_AT = Date.parse('2026-08-31T12:00:00.000Z');

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
    expect(html).toContain('미확인 현장 제보');
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
});
