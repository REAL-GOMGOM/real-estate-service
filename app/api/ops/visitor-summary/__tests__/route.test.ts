import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getVisitorSummary } = vi.hoisted(() => ({ getVisitorSummary: vi.fn() }));
vi.mock('@/lib/visitor-analytics', () => ({ getVisitorSummary }));

import { GET } from '../route';

describe('GET /api/ops/visitor-summary', () => {
  beforeEach(() => getVisitorSummary.mockReset());

  it('개별 방문 정보 없이 공개 집계 계약만 60초 캐시한다', async () => {
    getVisitorSummary.mockResolvedValue({
      schema: 'naezip.visitor-summary.v1',
      status: 'available',
      scope: 'analytics-consent',
      approximate: true,
      today: 12,
      last7Days: 45,
      total: 789,
      updatedAt: '2026-08-16T00:00:00.000Z',
      reason: null,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('s-maxage=60');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    await expect(response.json()).resolves.toEqual({
      schema: 'naezip.visitor-summary.v1',
      status: 'available',
      scope: 'analytics-consent',
      approximate: true,
      today: 12,
      last7Days: 45,
      total: 789,
      updatedAt: '2026-08-16T00:00:00.000Z',
      reason: null,
    });
  });

  it('장애 상태에서도 가짜 0 대신 명시적 unavailable 계약을 유지한다', async () => {
    getVisitorSummary.mockResolvedValue({
      schema: 'naezip.visitor-summary.v1',
      status: 'unavailable',
      scope: 'analytics-consent',
      approximate: true,
      today: null,
      last7Days: null,
      total: null,
      updatedAt: '2026-08-16T00:00:00.000Z',
      reason: 'store-unavailable',
    });

    const response = await GET();
    await expect(response.json()).resolves.toMatchObject({
      status: 'unavailable',
      today: null,
      last7Days: null,
      total: null,
    });
  });
});
