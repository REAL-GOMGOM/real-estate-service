import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { StackedBarChart } from '../StackedBarChart';
import { CHART_COLORS } from '@/lib/chart-colors';
import type { StackedBar } from '../StackedBarChart.utils';

/**
 * 사이클 S Step S-1 — StackedBarChart hex color 지원 검증.
 * NODE_ENV=production으로 dev warn 격리.
 */
describe('StackedBarChart hex color 지원 (사이클 S Step S-1)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hex 코드 직접 → segment fill 적용', () => {
    const bars: StackedBar[] = [
      { label: 'Q1', segments: [
        { label: 'A', value: 60, color: '#9ca3af' },
        { label: 'B', value: 40, color: '#dc2626' },
      ] },
    ];
    const html = renderToStaticMarkup(
      createElement(StackedBarChart, {
        title: 'hex 테스트',
        bars,
        showLegend: false,
      }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain('fill="#dc2626"');
  });

  it('키워드 → 회귀 0 (CHART_COLORS hex로 렌더)', () => {
    const bars: StackedBar[] = [
      { label: 'Q1', segments: [
        { label: 'A', value: 60, color: 'red' },
        { label: 'B', value: 40, color: 'blue' },
      ] },
    ];
    const html = renderToStaticMarkup(
      createElement(StackedBarChart, {
        title: '키워드',
        bars,
        showLegend: false,
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    expect(html).toContain(`fill="${CHART_COLORS.blue}"`);
  });
});
