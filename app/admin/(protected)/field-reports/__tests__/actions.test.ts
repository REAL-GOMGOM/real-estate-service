import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moderateFieldReportAction } from '../actions';
import { getAdminFieldReports } from '../data';
import type { AdminFieldReport } from '@/lib/field-reports/types';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  moderate: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/field-reports/repository', () => ({
  listFieldReportsForAdmin: mocks.list,
  moderateFieldReport: mocks.moderate,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath, updateTag: mocks.updateTag }));

const REPORT_ID = 'de6ef87a-7d20-4daa-b62f-5b1fb4e3b0a1';

function moderationForm(status = 'published', id = REPORT_ID) {
  const form = new FormData();
  form.set('id', id);
  form.set('status', status);
  return form;
}

function reportFixture(): AdminFieldReport {
  return {
    id: REPORT_ID,
    apartmentId: 'test-apartment',
    apartmentName: '테스트 단지',
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
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.com');
  mocks.auth.mockResolvedValue({ user: { id: 'admin', email: 'admin@example.com' } });
  mocks.list.mockResolvedValue([reportFixture()]);
  mocks.moderate.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllEnvs());

describe('field-report administrator authorization', () => {
  it.each([
    null,
    { user: {} },
    { user: { email: 'admin@example.com', role: 'admin' } },
    { user: { id: 'someone-else', email: 'admin@example.com', role: 'admin' } },
    { user: { id: 'admin', email: 'someone-else@example.com' } },
    { user: { id: 'admin' } },
  ])('denies both reads and mutations for an unprivileged session: %j', async (session) => {
    mocks.auth.mockResolvedValue(session);

    expect(await getAdminFieldReports()).toEqual({ status: 'forbidden' });
    expect(await moderateFieldReportAction(null, moderationForm())).toMatchObject({ status: 'error' });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
    expect(mocks.auth).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, '', '   '])('fails closed when ADMIN_EMAIL is not configured: %j', async (value) => {
    vi.stubEnv('ADMIN_EMAIL', value);
    expect(await getAdminFieldReports()).toEqual({ status: 'forbidden' });
    expect(await moderateFieldReportAction(null, moderationForm())).toMatchObject({ status: 'error' });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('matches a configured administrator email case-insensitively', async () => {
    vi.stubEnv('ADMIN_EMAIL', ' Admin@Example.COM ');
    mocks.auth.mockResolvedValue({ user: { id: 'admin', email: ' ADMIN@example.com ' } });

    expect(await getAdminFieldReports()).toMatchObject({ status: 'ready' });
    expect(await moderateFieldReportAction(null, moderationForm())).toMatchObject({ status: 'success' });
  });
});

describe('administrator moderation input and persistence', () => {
  it.each(['pending', 'delete', '', 'PUBLISHED'])('rejects an unsupported target state: %s', async (status) => {
    expect(await moderateFieldReportAction(null, moderationForm(status))).toMatchObject({ status: 'error' });
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it.each(['', 'not-an-id', '../published', `${REPORT_ID} `, 'a'.repeat(10000)])('rejects malformed report references', async (id) => {
    expect(await moderateFieldReportAction(null, moderationForm('published', id))).toMatchObject({ status: 'error' });
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it.each(['id', 'status'])('rejects duplicate %s form values', async (name) => {
    const form = moderationForm();
    form.append(name, name === 'id' ? REPORT_ID : 'hidden');
    expect(await moderateFieldReportAction(null, form)).toMatchObject({ status: 'error' });
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('rejects a file supplied instead of a report reference', async () => {
    const form = moderationForm();
    form.set('id', new Blob(['report']), 'report.txt');
    expect(await moderateFieldReportAction(null, form)).toMatchObject({ status: 'error' });
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it('rejects payloads that are not FormData', async () => {
    expect(await moderateFieldReportAction(null, null as unknown as FormData)).toMatchObject({ status: 'error' });
    expect(mocks.moderate).not.toHaveBeenCalled();
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it.each(['published', 'rejected', 'hidden'])('persists an authorized %s decision and refreshes affected views', async (status) => {
    const result = await moderateFieldReportAction(null, moderationForm(status));
    expect(result).toMatchObject({ status: 'success' });
    expect(mocks.moderate).toHaveBeenCalledWith(REPORT_ID, status);
    expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith('field-reports-public');
    expect(mocks.moderate.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateTag.mock.invocationCallOrder[0]);
    expect(mocks.updateTag.mock.invocationCallOrder[0]).toBeLessThan(mocks.revalidatePath.mock.invocationCallOrder[0]);
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/admin/field-reports'], ['/field-reports'], ['/'],
    ]);
  });

  it('keeps approval feedback explicit about not certifying the transaction', async () => {
    expect(await moderateFieldReportAction(null, moderationForm())).toMatchObject({
      status: 'success', message: expect.stringContaining('거래 사실 인증은 아닙니다'),
    });
  });

  it('reports a missing or expired report without showing successful publication', async () => {
    mocks.moderate.mockResolvedValue(false);
    expect(await moderateFieldReportAction(null, moderationForm())).toMatchObject({
      status: 'error', message: expect.stringContaining('만료'),
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith('field-reports-public');
  });

  it('does not leak or log persistence error details', async () => {
    const secret = 'postgres://private-user:secret-password@example.invalid/private-record';
    mocks.moderate.mockRejectedValue(new Error(secret));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await moderateFieldReportAction(null, moderationForm());
    expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('제보 저장소 준비') });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(log).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith('field-reports-public');
    log.mockRestore();
  });

  it('expires the public feed if the hide was applied before a transport timeout', async () => {
    let storedStatus = 'published';
    mocks.moderate.mockImplementation(async () => {
      storedStatus = 'hidden';
      throw new Error('response-timeout');
    });

    expect(await moderateFieldReportAction(null, moderationForm('hidden'))).toMatchObject({ status: 'error' });
    expect(storedStatus).toBe('hidden');
    expect(mocks.updateTag).toHaveBeenCalledExactlyOnceWith('field-reports-public');
    expect(mocks.moderate.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateTag.mock.invocationCallOrder[0]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('administrator private reads', () => {
  it('returns at most 100 reports in repository-provided priority order', async () => {
    const reports = Array.from({ length: 110 }, (_, index) => ({ ...reportFixture(), apartmentName: `test-${index}` }));
    mocks.list.mockResolvedValue(reports);
    const result = await getAdminFieldReports();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected authorized data');
    expect(result.reports).toEqual(reports.slice(0, 100));
    expect(result.checkedAt).toBeGreaterThan(0);
  });

  it('distinguishes an empty queue from an unavailable store', async () => {
    mocks.list.mockResolvedValue([]);
    expect(await getAdminFieldReports()).toMatchObject({ status: 'ready', reports: [] });
    mocks.list.mockRejectedValue(new Error('private database connection failed'));
    expect(await getAdminFieldReports()).toEqual({ status: 'unavailable' });
  });
});
