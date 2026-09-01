import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn(), list: vi.fn() }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), connection: vi.fn() }));
vi.mock('@/lib/field-reports/config', () => ({ fieldReportConfig: mocks.config }));
vi.mock('@/lib/field-reports/public-feed', () => ({ readPublishedFieldReports: mocks.list }));
import { GET } from '../route';
beforeEach(() => { vi.clearAllMocks(); mocks.config.mockReturnValue({ configured: true, submissionsEnabled: true }); mocks.list.mockResolvedValue([]); });
it('distinguishes a verified empty list from an unavailable backend', async () => {
  const response = await GET(); expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok', submissionsEnabled: true, reports: [] });
  expect(response.headers.get('cache-control')).toBe('no-store');
});
it('shows a distinct preparation state without storage and never presents a made-up report', async () => {
  mocks.config.mockReturnValue({ configured: false });
  const response = await GET(); expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'preparing', submissionsEnabled: false, reports: [] });
  expect(mocks.list).not.toHaveBeenCalled();
});
it('does not expose a provider error or enable submission after a read failure', async () => {
  mocks.list.mockRejectedValue(new Error('sensitive provider detail'));
  const response = await GET(); const body = await response.json();
  expect(response.status).toBe(503); expect(body.submissionsEnabled).toBe(false);
  expect(JSON.stringify(body)).not.toContain('sensitive');
});
