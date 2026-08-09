import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { metadata as regionMetadata } from '@/app/region/page';
import { RegionHubHero } from '@/components/region/RegionHubHero';
import { getTopLocations } from '@/lib/region-data';
import { PUBLIC_LOCATION_SCORES, WITHHELD_LOCATION_SCORE_IDS } from '@/lib/location-score-data';
import { formatLocationScore, scoreToQualityPercent } from '@/lib/score-utils';
import type { LocationScore } from '@/lib/types';

describe('공개 입지 점수 계약', () => {
  const scores = PUBLIC_LOCATION_SCORES as LocationScore[];

  it('데이터 파일 길이와 고유 지역 수가 일치한다', () => {
    expect(new Set(scores.map((region) => region.id)).size).toBe(scores.length);
  });

  it('지역 허브 문구와 메타데이터가 데이터 길이를 사용한다', () => {
    const markup = renderToStaticMarkup(createElement(RegionHubHero, { regionCount: scores.length }));

    expect(markup).toContain(`${scores.length}개 지역`);
    expect(String(regionMetadata.description)).toContain(`${scores.length}개 지역`);
    expect(markup).not.toContain('126개 지역');
    expect(String(regionMetadata.description)).not.toContain('126개 지역');
  });

  it('TOP 지역도 1~5 원점수를 유지하고 낮은 점수부터 정렬한다', () => {
    const top = getTopLocations(5);

    expect(top).toHaveLength(5);
    expect(top.every((region) => region.score >= 1 && region.score <= 5)).toBe(true);
    expect(top.map((region) => region.score)).toEqual(
      [...top].map((region) => region.score).sort((a, b) => a - b),
    );
  });

  it('행정구역 개편 후 재산정되지 않은 인천 구 점수를 공개하지 않는다', () => {
    expect(scores.some((region) => WITHHELD_LOCATION_SCORE_IDS.has(region.id))).toBe(false);
  });

  it('공개 점수와 시각화 백분율을 서로 다른 단위로 다룬다', () => {
    expect(formatLocationScore(1.31)).toBe('1.31');
    expect(scoreToQualityPercent(1)).toBe(100);
    expect(scoreToQualityPercent(5)).toBe(0);
    expect(scoreToQualityPercent(1.31)).toBe(92);
  });
});
