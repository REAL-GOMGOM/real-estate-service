import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  neon: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }));

import { fetchMarketLiveAggs } from '@/lib/agg-queries';

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://example.test/db');
  mocks.neon.mockReset();
  mocks.query.mockReset();
  mocks.neon.mockReturnValue(mocks.query);
  mocks.query.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchMarketLiveAggs', () => {
  it('모든 지역과 두 30일 구간을 하나의 SQL로 집계한다', async () => {
    const regions = ['강남구', '서초구'];

    await fetchMarketLiveAggs(regions, '2026-06-11', '2026-07-11', '2026-08-10');

    expect(mocks.neon).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [strings, ...params] = mocks.query.mock.calls[0];
    expect(Array.from(strings as TemplateStringsArray).join('?')).toContain('area_m2 BETWEEN 80 AND 88');
    expect(Array.from(strings as TemplateStringsArray).join('?')).toContain('is_canceled = false');
    expect(params).toContainEqual(regions);
    expect(params).toContain('2026-06-11');
    expect(params).toContain('2026-07-11');
    expect(params).toContain('2026-08-10');
  });

  it('지역이 없으면 DB를 호출하지 않는다', async () => {
    await expect(fetchMarketLiveAggs([], '2026-06-11', '2026-07-11', '2026-08-10')).resolves.toEqual([]);
    expect(mocks.neon).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
