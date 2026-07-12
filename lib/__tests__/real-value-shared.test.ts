import { describe, expect, it } from 'vitest';
import {
  buildRealValueInsight,
  buildRealValueShareText,
  type RealValueCardStats,
} from '../real-value-shared';

const base = (over: Partial<RealValueCardStats> = {}): RealValueCardStats => ({
  aptName: '은마아파트',
  district: '강남구',
  baseYear: 2020,
  compareYear: 2025,
  krwPct: 73.7,
  usdPct: 39.5,
  btcPct: -82.6,
  goldPct: -38.5,
  krwBase: '22.2억', krwCompare: '38.6억',
  usdBase: '$1.88M', usdCompare: '$2.63M',
  btcBase: '₿171.1', btcCompare: '₿29.72',
  goldBase: '32.23kg', goldCompare: '19.82kg',
  ...over,
});

describe('buildRealValueInsight — 해석 문장', () => {
  it('원화 상승 + 금·BTC 하락 → 화폐 가치 하락 프레임', () => {
    const t = buildRealValueInsight(base())!;
    expect(t).toContain('5년간');
    expect(t).toContain('73.7% 올랐지만');
    expect(t).toContain('금으로 재면 38.5%');
    expect(t).toContain('비트코인으로 재면 82.6%');
    expect(t).toContain('화폐 가치 하락분');
  });

  it('원화 상승 + 금만 하락 (BTC 미존재) → 금만 언급', () => {
    const t = buildRealValueInsight(base({ btcPct: null }))!;
    expect(t).toContain('금으로 재면');
    expect(t).not.toContain('비트코인');
  });

  it('원화·달러·금 모두 상승 → 실질 상승 프레임', () => {
    const t = buildRealValueInsight(base({ goldPct: 12.0, btcPct: 5.0 }))!;
    expect(t).toContain('모든 기준에서');
    expect(t).toContain('실질 상승');
  });

  it('원화 상승 + 실물 상승 + 달러만 하락 → 환율 프레임', () => {
    const t = buildRealValueInsight(base({ goldPct: 10.0, btcPct: null, usdPct: -8.2 }))!;
    expect(t).toContain('달러 기준으로는 8.2%');
    expect(t).toContain('환율');
  });

  it('원화 하락 + 금 기준 더 큰 하락 → 하락 폭 프레임', () => {
    const t = buildRealValueInsight(base({ krwPct: -12.0, goldPct: -30.0, usdPct: -15.0, btcPct: null }))!;
    expect(t).toContain('12.0% 내렸고');
    expect(t).toContain('하락 폭이 더 큽니다');
  });

  it('원화 변동률 없음 → null (해석 생략)', () => {
    expect(buildRealValueInsight(base({ krwPct: null }))).toBeNull();
  });
});

describe('buildRealValueShareText — 공유 텍스트', () => {
  it('4개 자산 행 + 해석 + 링크 포함', () => {
    const t = buildRealValueShareText(base());
    expect(t).toContain('🏠 은마아파트 실질 가치 (2020→2025)');
    expect(t).toContain('₩ 원화  22.2억 → 38.6억 (▲73.7%)');
    expect(t).toContain('₿ 비트  ₿171.1 → ₿29.72 (▼82.6%)');
    expect(t).toContain('💡');
    expect(t).toContain('naezipkorea.com/dollar');
  });

  it('값 없는 자산 행은 생략', () => {
    const t = buildRealValueShareText(base({ btcBase: undefined, btcCompare: undefined }));
    expect(t).not.toContain('₿ 비트');
    expect(t).toContain('₩ 원화');
  });

  it('해석 불가여도 텍스트는 생성 (해석 줄만 생략)', () => {
    const t = buildRealValueShareText(base({ krwPct: null, krwBase: undefined, krwCompare: undefined }));
    expect(t).not.toContain('💡');
    expect(t).toContain('naezipkorea.com/dollar');
  });
});
