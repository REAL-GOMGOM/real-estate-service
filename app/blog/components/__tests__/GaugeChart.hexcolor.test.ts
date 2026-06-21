import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { GaugeChart } from '../GaugeChart';
import { CHART_COLORS } from '@/lib/chart-colors';
import type { GaugeZone } from '../GaugeChart.utils';

/**
 * 사이클 O Phase 2 — GaugeChart hex color 지원 검증.
 * zones[].color와 color prop 양쪽 hex 입력 검증.
 * Phase 1 통일 패턴: NODE_ENV stub 없음.
 */
describe('GaugeChart hex color 지원 (사이클 O Phase 2)', () => {
  it('zones[].color에 hex 코드 직접 → 값 호 fill 적용', () => {
    const zones: GaugeZone[] = [
      { upTo: 50,  color: '#9ca3af' },
      { upTo: 100, color: '#dc2626' },
    ];
    const html = renderToStaticMarkup(
      createElement(GaugeChart, {
        title: 'zones hex',
        value: 30, // 첫 구간 (#9ca3af)
        zones,
      }),
    );
    expect(html).toContain('fill="#9ca3af"');
  });

  it('color prop에 hex 코드 직접 → 값 호 fill 적용', () => {
    const html = renderToStaticMarkup(
      createElement(GaugeChart, {
        title: 'color hex',
        value: 50,
        color: '#9ca3af',
      }),
    );
    expect(html).toContain('fill="#9ca3af"');
    // gradient fallback이 명시 hex를 덮지 않음
    expect(html).not.toContain('fill="#fef3c7"'); // gradient yellow가 아님
  });

  it('키워드 → CHART_COLORS hex로 렌더', () => {
    const html = renderToStaticMarkup(
      createElement(GaugeChart, {
        title: '키워드',
        value: 50,
        color: 'darkBlue',
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.darkBlue}"`);
  });
});
