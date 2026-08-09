import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  neon: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }));

import {
  fetchDistrictAggs,
  fetchHighlightLists,
  fetchSilvDistrictAggs,
} from '@/lib/agg-queries';

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

describe('fetchHighlightLists 신고가 계약', () => {
  it('최근 최신 거래를 이전 전체 이력 최고가와 strict 초과 비교한다', async () => {
    await fetchHighlightLists('2026-07-11', '2026-08-10', 10);

    expect(mocks.query).toHaveBeenCalledTimes(3);
    const [strings] = mocks.query.mock.calls[0];
    const queryText = Array.from(strings as TemplateStringsArray).join('?');

    expect(queryText).toContain('t.deal_date < l.deal_date');
    expect(queryText).toContain('t.umd_nm = l.umd_nm');
    expect(queryText).toContain('max(t.deal_amount) AS prev_high');
    expect(queryText).toContain('WHERE deal_amount > prev_high');
    expect(queryText).not.toContain('deal_amount >= prev_high');

    const surgeText = Array.from(
      mocks.query.mock.calls[1][0] as TemplateStringsArray,
    ).join('?');
    expect(surgeText).toContain('PARTITION BY sigungu, umd_nm, apt_name, area_r');
    expect(surgeText).toContain('r2.umd_nm = r1.umd_nm');

    const pyeong84Text = Array.from(
      mocks.query.mock.calls[2][0] as TemplateStringsArray,
    ).join('?');
    expect(pyeong84Text).toContain('DISTINCT ON (sigungu, umd_nm, apt_name)');
    expect(pyeong84Text).toContain('umd_nm AS "umdNm"');
  });

  it.each([
    ['매매', fetchDistrictAggs],
    ['분양권', fetchSilvDistrictAggs],
  ] as const)('%s 신고가 집계를 법정동 단위로 분리한다', async (_label, fetchAggs) => {
    await fetchAggs('2026-07-11', '2026-08-10');

    const [strings] = mocks.query.mock.calls[0];
    const queryText = Array.from(strings as TemplateStringsArray).join('?');
    expect(queryText).toContain('PARTITION BY sigungu, umd_nm, apt_name, area_r');
    expect(queryText).toContain('GROUP BY sigungu, umd_nm, apt_name, area_r');
  });
});
