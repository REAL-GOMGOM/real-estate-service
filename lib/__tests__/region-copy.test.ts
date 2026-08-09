import { describe, expect, it } from 'vitest';
import { buildRegionHeadline, buildRegionSummary } from '@/lib/region-copy';
import type { RegionDetail } from '@/lib/types';

const region = {
  id: 'gangnam-gu',
  name: '강남구',
  district: '강남구',
  region: '서울',
  level: 'district',
  lat: 37.5,
  lng: 127,
  month: '2026-07',
  lastUpdated: '2026-07-03',
  score: 1.31,
  prevScore: 1,
  trend: 'up',
  metrics: {
    pricePerPyeong: 9_596,
    annualChange2025: 13,
    weeklyChange2026: -0.06,
    transport: 10,
    school: 10,
    industry: 10,
    supply: 5,
    jeonseRatio: 42,
    populationFlow: -100,
    tradeVolumeChange: 5,
    unsold: 0,
    confidence: 'H',
  },
  scenarios: { base: 1.31, price: 1.22, growth: 1.35, infra: 1.28, sensitivity: 0.06 },
  isToheo: false,
  source: 'eric_v2',
  insight: {
    id: 'gangnam-gu',
    headline: '강남3구 최강자',
    summary: '올해 누적 +13%로 확실한 매수 기회입니다.',
    tags: ['매수 추천'],
    generatedAt: '2026-07-01',
    scoreAtGeneration: 1,
  },
} satisfies RegionDetail;

describe('region copy', () => {
  it('검수되지 않은 생성형 해설을 검색 메타와 본문용 문구에 재사용하지 않는다', () => {
    const headline = buildRegionHeadline(region);
    const summary = buildRegionSummary(region);

    expect(headline).toBe('강남구 입지 지표 요약');
    expect(`${headline} ${summary}`).not.toContain('최강자');
    expect(`${headline} ${summary}`).not.toContain('매수 기회');
  });

  it('점수의 상대평가 성격과 시점 한계를 함께 밝힌다', () => {
    const summary = buildRegionSummary(region);

    expect(summary).toContain('등록 지역 표본');
    expect(summary).toContain('공식 지역 등급은 아닙니다');
    expect(summary).toContain('2025년 연간');
    expect(summary).toContain('실제 관측 시점은 서로 다를 수 있습니다');
  });
});
