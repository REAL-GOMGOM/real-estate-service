import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ neon: vi.fn(), query: vi.fn() }));

vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }));

import { fetchRankingTradeStats, rankingWindow } from '@/lib/ranking-queries';

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'postgresql://example.test/db');
  mocks.neon.mockReset();
  mocks.query.mockReset();
  mocks.neon.mockReturnValue(mocks.query);
  mocks.query
    .mockResolvedValueOnce([{ transactionCount: 10, districtCount: 2, firstDealDate: '2026-07-01', lastDealDate: '2026-08-01' }])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([]);
});

afterEach(() => vi.unstubAllEnvs());

describe('rankingWindow', () => {
  it('KST 오늘을 포함하는 rolling 3개월 범위를 만든다', () => {
    expect(rankingWindow(3, new Date('2026-08-09T03:00:00Z'))).toEqual({
      from: '2026-05-09',
      toExclusive: '2026-08-10',
      asOf: '2026-08-09',
    });
  });
});

describe('fetchRankingTradeStats', () => {
  it('취소 제외·면적 필터를 DB 집계에 적용하고 신고가는 전체 과거와 비교한다', async () => {
    const result = await fetchRankingTradeStats('2026-05-09', '2026-08-10', '84');

    expect(result.coverage.districtCount).toBe(2);
    expect(mocks.query).toHaveBeenCalledTimes(4);
    const sqlTexts = mocks.query.mock.calls.map(([strings]) =>
      Array.from(strings as TemplateStringsArray).join('?'),
    );
    for (const queryText of sqlTexts) expect(queryText).toContain('is_canceled = false');
    expect(sqlTexts[0]).toContain("area_m2 >= 82 AND area_m2 < 87");
    expect(sqlTexts[0]).toContain("area_m2 >= 57 AND area_m2 < 62");
    expect(sqlTexts[0]).toContain("area_m2 >= 87");
    expect(sqlTexts[3]).toContain('t.deal_date < l.deal_date');
    expect(sqlTexts[2]).toContain('GROUP BY region_code, sigungu, umd_nm, apt_name');
    expect(sqlTexts[3]).toContain('t.umd_nm = l.umd_nm');
    expect(sqlTexts[3]).toContain('WHERE deal_amount > prev_high');
  });
});
