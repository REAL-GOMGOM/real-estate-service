import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_LOCATION_SCORES } from '@/lib/location-score-data';
import type { RegionDetail } from '@/lib/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...props }, children),
}));

import { RegionHero } from '../RegionHero';
import { RegionMarketMetrics } from '../RegionMarketMetrics';

function regionDetail(id: string): RegionDetail {
  const region = PUBLIC_LOCATION_SCORES.find((item) => item.id === id);
  if (!region) throw new Error(`${id} region fixture is missing`);
  return {
    ...region,
    insight: {
      id: region.id,
      headline: region.name,
      summary: '',
      tags: [],
      generatedAt: '',
      scoreAtGeneration: region.score,
    },
  };
}

function renderLinks(region: RegionDetail): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      createElement(RegionHero, { region }),
      createElement(RegionMarketMetrics, { region }),
    ),
  );
}

describe('region detail transaction links', () => {
  it('renders prominent, accessible links with the correct district', () => {
    const html = renderLinks(regionDetail('gangnam-gu'));
    const href = '/transactions?district=%EA%B0%95%EB%82%A8%EA%B5%AC';

    expect(html.split(`href="${href}"`)).toHaveLength(3);
    expect(html.match(/aria-label="강남구 실거래 보기"/g)).toHaveLength(2);
    expect(html.match(/이 지역 실거래 보기/g)).toHaveLength(2);
  });

  it('tells aggregate-region users that district selection comes next', () => {
    const html = renderLinks(regionDetail('seoul-city'));

    expect(html.split('href="/transactions"')).toHaveLength(3);
    expect(html.match(/aria-label="서울 실거래 지역 선택하기"/g)).toHaveLength(2);
    expect(html.match(/지역 선택 후 실거래 보기/g)).toHaveLength(2);
    expect(html).not.toContain('이 지역 실거래 보기');
  });
});
