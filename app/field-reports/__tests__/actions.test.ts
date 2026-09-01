import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn(), consume: vi.fn(), create: vi.fn(), flag: vi.fn(), apartment: vi.fn(), headers: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/field-reports/config', () => ({ fieldReportConfig: mocks.config }));
vi.mock('@/lib/field-reports/repository', () => ({ fieldReportStore: () => ({ consumeRateLimit: mocks.consume, create: mocks.create, flag: mocks.flag }) }));
vi.mock('@/lib/field-reports/apartment', () => ({ resolveFieldReportApartment: mocks.apartment }));
import { submitFieldReport, reportFieldReport } from '../actions';
import { kstDate } from '@/lib/field-reports/validation';

const id = '323b6412-58ad-4de9-98ab-9fd9c9d38a9d';
function form() { const data = new FormData(); Object.entries({ apartmentId: 'valid-apt', area: '84.95', tradeType: 'sale', price: '83000', contractDate: kstDate(), source: 'participant', consent: 'on', confirmContracted: 'on' }).forEach(([k, v]) => data.set(k, v)); return data; }
beforeEach(() => {
  vi.clearAllMocks(); mocks.config.mockReturnValue({ submissionsEnabled: true, flagsEnabled: true, salt: 'a'.repeat(32) });
  mocks.headers.mockResolvedValue(new Headers({ 'x-vercel-forwarded-for': '192.0.2.10' }));
  mocks.consume.mockResolvedValue(true); mocks.create.mockResolvedValue(id); mocks.flag.mockResolvedValue(true);
  mocks.apartment.mockResolvedValue({ name: '서버 단지', sido: '서울', sigungu: '강남구', dong: null });
});
describe('public field report actions', () => {
  it('saves a selected server-verified apartment then acknowledges pending review', async () => {
    const result = await submitFieldReport({ status: 'idle' }, form());
    expect(result).toMatchObject({ status: 'success', receipt: id });
    expect(mocks.create.mock.calls[0][1].name).toBe('서버 단지');
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty('status');
  });
  it('does not accept forged public/moderation fields', async () => {
    const data = form(); data.set('status', 'published');
    expect((await submitFieldReport({ status: 'idle' }, data)).status).toBe('error');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('fails closed when disabled', async () => {
    mocks.config.mockReturnValue({ submissionsEnabled: false });
    expect((await submitFieldReport({ status: 'idle' }, form())).status).toBe('error');
    expect(mocks.apartment).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(['limited', 'unknown-ip', 'limiter-down', 'unknown-apartment', 'db-down'])('never reports saved for %s', async (mode) => {
    if (mode === 'limited') mocks.consume.mockResolvedValue(false);
    if (mode === 'unknown-ip') mocks.headers.mockResolvedValue(new Headers());
    if (mode === 'limiter-down') mocks.consume.mockRejectedValue(new Error('private credential'));
    if (mode === 'unknown-apartment') mocks.apartment.mockResolvedValue(null);
    if (mode === 'db-down') mocks.create.mockRejectedValue(new Error('private credential'));
    const result = await submitFieldReport({ status: 'idle' }, form());
    expect(result.status).toBe('error'); expect(JSON.stringify(result)).not.toContain('private credential');
    if (mode !== 'db-down') expect(mocks.create).not.toHaveBeenCalled();
  });
  it('only records a flag against a public UUID, without accepting comments', async () => {
    const data = new FormData(); data.set('reportId', id); data.set('reason', 'duplicate');
    expect((await reportFieldReport({ status: 'idle' }, data)).status).toBe('success');
    expect(mocks.flag).toHaveBeenCalledWith(id, 'duplicate');
    data.set('reason', 'private phone');
    expect((await reportFieldReport({ status: 'idle' }, data)).status).toBe('error');
  });
  it('continues to accept flags on published reports when new submissions are paused', async () => {
    mocks.config.mockReturnValue({ submissionsEnabled: false, flagsEnabled: true, salt: 'a'.repeat(32) });
    const data = new FormData(); data.set('reportId', id); data.set('reason', 'duplicate');
    expect((await reportFieldReport({ status: 'idle' }, data)).status).toBe('success');
  });
});
