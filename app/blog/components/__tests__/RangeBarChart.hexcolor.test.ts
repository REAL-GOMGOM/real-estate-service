import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RangeBarChart } from '../RangeBarChart';
import { CHART_COLORS } from '@/lib/chart-colors';
import type { RangeItem } from '../RangeBarChart.utils';

/**
 * 사이클 O Phase 2 — RangeBarChart hex color 지원 검증.
 * Phase 1 통일 패턴: NODE_ENV stub 없음.
 */
describe('RangeBarChart hex color 지원 (사이클 O Phase 2)', () => {
  it('hex 코드 직접 → 막대 fill 적용', () => {
    const items: RangeItem[] = [
      { label: 'A', min: 10, max: 30, color: '#9ca3af' },
      { label: 'B', min: 15, max: 25, color: '#dc2626' },
    ];
    const html = renderToStaticMarkup(
      createElement(RangeBarChart, { title: 'hex', unit: '억', items }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain('fill="#dc2626"');
  });

  it('키워드 → CHART_COLORS hex로 렌더', () => {
    const items: RangeItem[] = [
      { label: 'A', min: 10, max: 30, color: 'red' },
      { label: 'B', min: 15, max: 25, color: 'darkBlue' },
    ];
    const html = renderToStaticMarkup(
      createElement(RangeBarChart, { title: '키워드', unit: '억', items }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    expect(html).toContain(`fill="${CHART_COLORS.darkBlue}"`);
  });
});
