import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  neon: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@neondatabase/serverless', () => ({ neon: mocks.neon }));

import {
  fetchDistrictAggs,
  fetchHighlightLists,
  fetchMarketLiveAggs,
  fetchRentDistrictAggs,
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
    expect(queryText.match(/right\([^)]*deal_date, 2\) <> '00'/g)).toHaveLength(2);

    const surgeText = Array.from(
      mocks.query.mock.calls[1][0] as TemplateStringsArray,
    ).join('?');
    expect(surgeText).toContain('PARTITION BY sigungu, umd_nm, apt_name, area_r');
    expect(surgeText).toContain('r2.umd_nm = r1.umd_nm');
    expect(surgeText).toContain("right(deal_date, 2) <> '00'");

    const pyeong84Text = Array.from(
      mocks.query.mock.calls[2][0] as TemplateStringsArray,
    ).join('?');
    expect(pyeong84Text).toContain('DISTINCT ON (sigungu, umd_nm, apt_name)');
    expect(pyeong84Text).toContain('umd_nm AS "umdNm"');
    expect(pyeong84Text).toContain("right(deal_date, 2) <> '00'");
  });

  it.each([
    ['매매', fetchDistrictAggs],
    ['분양권', fetchSilvDistrictAggs],
  ] as const)('%s 신고가 집계를 법정동 단위 전체 과거 최고가와 비교한다', async (_label, fetchAggs) => {
    await fetchAggs('2026-07-11', '2026-08-10');

    const [strings] = mocks.query.mock.calls[0];
    const queryText = Array.from(strings as TemplateStringsArray).join('?');
    expect(queryText).toContain('DISTINCT ON (sigungu, umd_nm, apt_name, area_r)');
    expect(queryText).toContain('t.umd_nm = l.umd_nm');
    expect(queryText).toContain('max(t.deal_amount) AS prior_max');
    expect(queryText).toContain('t.deal_date < l.deal_date');
    expect(queryText).toContain('WHERE latest_amt > prior_max');
    expect(queryText).not.toContain('latest_amt >= prior_max');
    expect(queryText.match(/right\([^)]*deal_date, 2\) <> '00'/g)).toHaveLength(2);
  });

  it('전월세와 landing 집계에서도 일자 미상 행을 제외한다', async () => {
    await fetchRentDistrictAggs('2026-07-11', '2026-08-10', 'monthly');
    let [strings] = mocks.query.mock.calls[0];
    let queryText = Array.from(strings as TemplateStringsArray).join('?');
    expect(queryText).toContain("right(deal_date, 2) <> '00'");
    expect(queryText).toContain('monthly_rent > 0');

    mocks.query.mockClear();
    await fetchMarketLiveAggs(['강남구'], '2026-06-11', '2026-07-11', '2026-08-10');
    [strings] = mocks.query.mock.calls[0];
    queryText = Array.from(strings as TemplateStringsArray).join('?');
    expect(queryText).toContain("right(deal_date, 2) <> '00'");
  });
});
