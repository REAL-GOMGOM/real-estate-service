import { describe, expect, it } from 'vitest';

import { rankingWindow, type RankingArea } from '../../ranking-queries';
import {
  RANKING_AREAS,
  RANKING_PERIOD_MONTHS,
  RANKING_TRADE_STATS_ARTIFACT_NAME,
  RANKING_TRADE_STATS_SCHEMA,
  assertRankingTradeStatsEnvelope,
  buildRankingTradeStatsArtifact,
  findRankingTradeStatsVariant,
  type RankingTradeStatsVariant,
} from '../ranking-artifact';

const GENERATED_AT = '2026-08-22T20:12:36.971Z';

function variant(periodMonths: 3 | 12, area: RankingArea): RankingTradeStatsVariant {
  return {
    periodMonths,
    area,
    window: rankingWindow(periodMonths, new Date(GENERATED_AT)),
    coverage: {
      transactionCount: 10,
      districtCount: 2,
      firstDealDate: periodMonths === 3 ? '2026-07-01' : '2025-09-01',
      lastDealDate: '2026-08-22',
    },
    topPrice: [{
      regionCode: 'ALL', rank: 1, aptName: '테스트단지', district: '강남구', dong: '대치동',
      price: 300_000, area: 84.9, floor: 10, dealDate: '2026-08-22',
    }],
    volume: [{
      regionCode: 'ALL', rank: 1, aptName: '테스트단지', district: '강남구', dong: '대치동',
      count: 4, avgPrice: 280_000,
    }],
    newHigh: [{
      regionCode: 'ALL', rank: 1, aptName: '테스트단지', district: '강남구', dong: '대치동',
      price: 300_000, prevHigh: 280_000, diff: 20_000, diffPercent: 7.1,
    }],
  };
}

function variants() {
  return RANKING_PERIOD_MONTHS.flatMap((periodMonths) => (
    RANKING_AREAS.map((area) => variant(periodMonths, area))
  ));
}

describe('ranking trade stats serving artifact', () => {
  it('builds all eight ordered period/area variants and supports exact lookup', () => {
    const artifact = buildRankingTradeStatsArtifact({ generatedAt: GENERATED_AT, variants: variants() });
    const envelope = {
      schema: artifact.schema,
      generatedAt: GENERATED_AT,
      itemCount: artifact.itemCount,
      data: artifact.data,
    };

    expect(artifact).toMatchObject({
      name: RANKING_TRADE_STATS_ARTIFACT_NAME,
      schema: RANKING_TRADE_STATS_SCHEMA,
      itemCount: 8,
      data: { status: 'ok', updatedAt: GENERATED_AT },
    });
    expect(() => assertRankingTradeStatsEnvelope(envelope)).not.toThrow();
    expect(findRankingTradeStatsVariant(artifact.data, 12, '84')).toMatchObject({
      periodMonths: 12,
      area: '84',
    });
  });

  it('accepts authoritative zero coverage while rejecting missing variants', () => {
    const all = variants();
    all[0] = {
      ...all[0],
      coverage: { transactionCount: 0, districtCount: 0, firstDealDate: null, lastDealDate: null },
      topPrice: [],
      volume: [],
      newHigh: [],
    };
    expect(() => buildRankingTradeStatsArtifact({ generatedAt: GENERATED_AT, variants: all })).not.toThrow();
    expect(() => buildRankingTradeStatsArtifact({ generatedAt: GENERATED_AT, variants: all.slice(1) }))
      .toThrow('variants are incomplete');
  });

  it('fails closed for reordered variants, stale windows, rank gaps, prototype keys, and altered new-high math', () => {
    const artifact = buildRankingTradeStatsArtifact({ generatedAt: GENERATED_AT, variants: variants() });
    const envelope = {
      schema: artifact.schema,
      generatedAt: GENERATED_AT,
      itemCount: artifact.itemCount,
      data: artifact.data,
    };

    const reordered = structuredClone(envelope);
    [reordered.data.variants[0], reordered.data.variants[1]] = [
      reordered.data.variants[1], reordered.data.variants[0],
    ];
    expect(() => assertRankingTradeStatsEnvelope(reordered)).toThrow('period/area order');

    const wrongWindow = structuredClone(envelope);
    wrongWindow.data.variants[0].window.from = '2026-01-01';
    expect(() => assertRankingTradeStatsEnvelope(wrongWindow)).toThrow('window does not match');

    const rankGap = structuredClone(envelope);
    rankGap.data.variants[0].topPrice[0].rank = 2;
    expect(() => assertRankingTradeStatsEnvelope(rankGap)).toThrow('rank is out of order');

    const prototypeRegion = structuredClone(envelope);
    prototypeRegion.data.variants[0].topPrice[0].regionCode = 'constructor';
    expect(() => assertRankingTradeStatsEnvelope(prototypeRegion)).toThrow('regionCode is invalid');

    const wrongMath = structuredClone(envelope);
    wrongMath.data.variants[0].newHigh[0].diff = 19_999;
    expect(() => assertRankingTradeStatsEnvelope(wrongMath)).toThrow('not a strict new high');
  });
});
