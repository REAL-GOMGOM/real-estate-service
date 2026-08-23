import { describe, expect, it } from 'vitest';

import { MARKET_LIVE_REGIONS } from '../../market-live';
import {
  HIGHLIGHTS_ROLLING30_ARTIFACT_NAME,
  MARKET_LIVE_ROLLING30_ARTIFACT_NAME,
  TRANSACTION_HIGHLIGHTS_SCHEMA,
  TRANSACTION_MARKET_LIVE_SCHEMA,
  TRANSACTION_SNAPSHOT_MAX_AGE_MS,
  ServingArtifactValidationError,
  assertRolling30HighlightsEnvelope,
  assertRolling30MarketLiveEnvelope,
  buildRolling30HighlightsArtifact,
  buildRolling30MarketLiveArtifact,
  isServingArtifactFresh,
  type HighlightDeal,
  type NewHighHighlightDeal,
  type SurgeHighlightDeal,
} from '../serving-artifacts';

const GENERATED_AT = '2026-08-13T13:12:16.831Z';

const baseDeal: HighlightDeal = {
  district: '강남구',
  dong: '대치동',
  apt: '은마',
  area: 88.4,
  floor: 12,
  price: 300_000,
  date: '2026-08-12',
  masterId: 'apt-eunma',
};

const newHigh: NewHighHighlightDeal = {
  ...baseDeal,
  prevHigh: 290_000,
};

const surge: SurgeHighlightDeal = {
  ...baseDeal,
  apt: '테스트 급등',
  area: 59.8,
  price: 250_000,
  prevPrice: 200_000,
  ratePct: 25,
  masterId: null,
};

function envelope<T>(artifact: { schema: string; itemCount: number; data: T }) {
  return {
    schema: artifact.schema,
    generatedAt: GENERATED_AT,
    itemCount: artifact.itemCount,
    data: artifact.data,
  };
}

function marketAggregates() {
  return MARKET_LIVE_REGIONS.map((sigungu, index) => index === 0
    ? {
      sigungu,
      recentSum: 610_000,
      recentCount: 3,
      previousSum: 360_000,
      previousCount: 2,
    }
    : {
      sigungu,
      recentSum: 0,
      recentCount: 0,
      previousSum: 0,
      previousCount: 0,
    });
}

describe('rolling30 highlights serving artifact', () => {
  it('builds the current API body with KST-aligned windows and decimal areas', () => {
    const artifact = buildRolling30HighlightsArtifact({
      generatedAt: GENERATED_AT,
      newHighs: [newHigh],
      surges: [surge],
      pyeong84: [baseDeal],
    });

    expect(artifact).toMatchObject({
      name: HIGHLIGHTS_ROLLING30_ARTIFACT_NAME,
      schema: TRANSACTION_HIGHLIGHTS_SCHEMA,
      itemCount: 3,
      data: {
        status: 'ok',
        month: '202608',
        window: { type: 'rolling30', from: '2026-07-15', to: '2026-08-14' },
        updatedAt: GENERATED_AT,
      },
    });
    expect(artifact.data.pyeong84[0].area).toBe(88.4);
    expect(() => assertRolling30HighlightsEnvelope(envelope(artifact))).not.toThrow();
  });

  it('preserves a valid zero-row result as status=ok', () => {
    const artifact = buildRolling30HighlightsArtifact({
      generatedAt: GENERATED_AT,
      newHighs: [],
      surges: [],
      pyeong84: [],
    });

    expect(artifact.itemCount).toBe(0);
    expect(artifact.data).toMatchObject({ status: 'ok', newHighs: [], surges: [], pyeong84: [] });
    expect(() => assertRolling30HighlightsEnvelope(envelope(artifact))).not.toThrow();
  });

  it('rejects altered windows, ranking order, rate math, dates, and envelope metadata', () => {
    expect(() => buildRolling30HighlightsArtifact({
      generatedAt: GENERATED_AT,
      newHighs: [
        newHigh,
        { ...newHigh, apt: '더 싼 아파트', price: 310_000, prevHigh: 300_000 },
      ],
      surges: [surge],
      pyeong84: [baseDeal],
    })).toThrow('not in ranking order');
  });

  it('fails closed for every independently corrupted contract boundary', () => {
    const artifact = buildRolling30HighlightsArtifact({
      generatedAt: GENERATED_AT,
      newHighs: [newHigh],
      surges: [surge],
      pyeong84: [baseDeal],
    });
    const valid = envelope(artifact);

    const wrongWindow = structuredClone(valid);
    wrongWindow.data.window.from = '2026-07-14';
    expect(() => assertRolling30HighlightsEnvelope(wrongWindow)).toThrow('does not match generatedAt');

    const wrongRate = structuredClone(valid);
    wrongRate.data.surges[0].ratePct = 24.9;
    expect(() => assertRolling30HighlightsEnvelope(wrongRate)).toThrow('does not match its prices');

    const wrongDate = structuredClone(valid);
    wrongDate.data.newHighs[0].date = '2026-06-01';
    expect(() => assertRolling30HighlightsEnvelope(wrongDate)).toThrow('outside the rolling30 window');

    const mismatchedGeneratedAt = { ...valid, generatedAt: '2026-08-13T13:12:17.831Z' };
    expect(() => assertRolling30HighlightsEnvelope(mismatchedGeneratedAt)).toThrow('does not match its data');

    expect(() => assertRolling30HighlightsEnvelope({ ...valid, itemCount: 99 }))
      .toThrow('does not match its data');
    expect(() => assertRolling30HighlightsEnvelope({ ...valid, extra: true }))
      .toThrow(ServingArtifactValidationError);
  });
});

describe('rolling30 market-live serving artifact', () => {
  it('builds six ordered rows and exact recent/previous windows from unordered aggregates', () => {
    const artifact = buildRolling30MarketLiveArtifact({
      generatedAt: GENERATED_AT,
      aggregates: marketAggregates().reverse(),
    });

    expect(artifact).toMatchObject({
      name: MARKET_LIVE_ROLLING30_ARTIFACT_NAME,
      schema: TRANSACTION_MARKET_LIVE_SCHEMA,
      itemCount: 6,
      data: {
        status: 'ok',
        windows: {
          recent: { from: '2026-07-15', toExclusive: '2026-08-14', days: 30 },
          previous: { from: '2026-06-15', toExclusive: '2026-07-15', days: 30 },
        },
        updatedAt: GENERATED_AT,
      },
    });
    expect(artifact.data.rows[0]).toEqual({
      region: '강남구',
      recentAverage: 203_333,
      recentCount: 3,
      previousAverage: 180_000,
      previousCount: 2,
      changePct: 13,
    });
    expect(artifact.data.rows.map(({ region }) => region)).toEqual(MARKET_LIVE_REGIONS);
    expect(() => assertRolling30MarketLiveEnvelope(envelope(artifact))).not.toThrow();
  });

  it('represents an authoritative empty market as six zero-count rows', () => {
    const aggregates = marketAggregates().map((row) => ({
      ...row,
      recentSum: 0,
      recentCount: 0,
      previousSum: 0,
      previousCount: 0,
    }));
    const artifact = buildRolling30MarketLiveArtifact({ generatedAt: GENERATED_AT, aggregates });

    expect(artifact.data.rows).toHaveLength(6);
    expect(artifact.data.rows.every((row) => row.recentCount === 0
      && row.previousCount === 0
      && row.recentAverage === null
      && row.previousAverage === null
      && row.changePct === null)).toBe(true);
    expect(() => assertRolling30MarketLiveEnvelope(envelope(artifact))).not.toThrow();
  });

  it('does not turn a missing or structurally broken aggregate query into a valid empty artifact', () => {
    expect(() => buildRolling30MarketLiveArtifact({ generatedAt: GENERATED_AT, aggregates: [] }))
      .toThrow('must contain every configured region');
    const duplicate = marketAggregates();
    duplicate[1] = { ...duplicate[1], sigungu: duplicate[0].sigungu };
    expect(() => buildRolling30MarketLiveArtifact({ generatedAt: GENERATED_AT, aggregates: duplicate }))
      .toThrow('duplicate regions');
    const inconsistent = marketAggregates();
    inconsistent[1] = { ...inconsistent[1], recentSum: 1, recentCount: 0 };
    expect(() => buildRolling30MarketLiveArtifact({ generatedAt: GENERATED_AT, aggregates: inconsistent }))
      .toThrow('sum/count are inconsistent');
  });

  it('rejects altered row order, math, windows, generatedAt, and itemCount', () => {
    const artifact = buildRolling30MarketLiveArtifact({
      generatedAt: GENERATED_AT,
      aggregates: marketAggregates(),
    });
    const valid = envelope(artifact);

    const wrongOrder = structuredClone(valid);
    [wrongOrder.data.rows[0], wrongOrder.data.rows[1]] = [wrongOrder.data.rows[1], wrongOrder.data.rows[0]];
    expect(() => assertRolling30MarketLiveEnvelope(wrongOrder)).toThrow('region is out of order');

    const wrongMath = structuredClone(valid);
    wrongMath.data.rows[0].changePct = 12.9;
    expect(() => assertRolling30MarketLiveEnvelope(wrongMath)).toThrow('does not match its averages');

    const wrongWindow = structuredClone(valid);
    wrongWindow.data.windows.previous.from = '2026-06-14';
    expect(() => assertRolling30MarketLiveEnvelope(wrongWindow)).toThrow('does not match updatedAt');

    expect(() => assertRolling30MarketLiveEnvelope({
      ...valid,
      generatedAt: '2026-08-13T13:12:17.831Z',
    })).toThrow('does not match its data');
    expect(() => assertRolling30MarketLiveEnvelope({ ...valid, itemCount: 0 }))
      .toThrow('does not match its data');
  });
});

describe('serving artifact freshness boundary', () => {
  it('accepts at 48 hours and rejects older artifacts', () => {
    const generatedAtMs = Date.parse(GENERATED_AT);
    expect(isServingArtifactFresh(GENERATED_AT, {
      now: new Date(generatedAtMs + TRANSACTION_SNAPSHOT_MAX_AGE_MS),
      maxAgeMs: TRANSACTION_SNAPSHOT_MAX_AGE_MS,
    })).toBe(true);
    expect(isServingArtifactFresh(GENERATED_AT, {
      now: new Date(generatedAtMs + TRANSACTION_SNAPSHOT_MAX_AGE_MS + 1),
      maxAgeMs: TRANSACTION_SNAPSHOT_MAX_AGE_MS,
    })).toBe(false);
  });
});
