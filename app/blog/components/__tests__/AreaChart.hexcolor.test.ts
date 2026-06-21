import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AreaChart } from '../AreaChart';
import { CHART_COLORS } from '@/lib/chart-colors';
import type { AreaSeries } from '../AreaChart.utils';

/**
 * 사이클 O Phase 1 — AreaChart hex color 지원 검증.
 * StackedBarChart.hexcolor.test 패턴 차용. NODE_ENV=production으로 dev warn 격리.
 */
describe('AreaChart hex color 지원 (사이클 O Phase 1)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hex 코드 직접 → 면적 fill·선 stroke 적용', () => {
    const series: AreaSeries[] = [{
      name:  'A',
      color: '#9ca3af',
      data:  [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }, { x: 'Q3', y: 30 }],
    }];
    const html = renderToStaticMarkup(
      createElement(AreaChart, { title: 'hex 테스트', series }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain('stroke="#9ca3af"');
    // 단일 시리즈 blue fallback이 hex 명시값을 덮지 않음
    expect(html).not.toContain(`stroke="${CHART_COLORS.blue}"`);
  });

  it('키워드 → CHART_COLORS hex로 렌더 (다중 시리즈)', () => {
    const series: AreaSeries[] = [
      { name: 'A', color: 'red',  data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }] },
      { name: 'B', color: 'blue', data: [{ x: 'Q1', y: 5  }, { x: 'Q2', y: 15 }] },
    ];
    const html = renderToStaticMarkup(
      createElement(AreaChart, { title: '키워드', series, showLegend: false }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    expect(html).toContain(`fill="${CHART_COLORS.blue}"`);
  });
});
