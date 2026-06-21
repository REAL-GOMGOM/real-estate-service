import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ScatterPlot } from '../ScatterPlot';
import { CHART_COLORS } from '@/lib/chart-colors';
import type { ScatterGroup } from '../ScatterPlot.utils';

/**
 * 사이클 O Phase 1 — ScatterPlot hex color 지원 검증.
 * 상단 정적 import + NODE_ENV stub 패턴 (StackedBarChart.hexcolor.test 차용).
 * 정적 import는 stub 이전에 발생 → jsxDEV runtime 정상 보존.
 */
describe('ScatterPlot hex color 지원 (사이클 O Phase 1)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hex 코드 직접 → circle fill 적용', () => {
    const groups: ScatterGroup[] = [
      { name: 'A', color: '#9ca3af', dots: [{ x: 10, y: 20 }] },
      { name: 'B', color: '#dc2626', dots: [{ x: 30, y: 40 }] },
    ];
    const html = renderToStaticMarkup(
      createElement(ScatterPlot, { title: 'hex 테스트', groups, showLegend: false }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain('fill="#dc2626"');
  });

  it('키워드 → CHART_COLORS hex로 렌더', () => {
    const groups: ScatterGroup[] = [
      { name: 'A', color: 'red',  dots: [{ x: 10, y: 20 }] },
      { name: 'B', color: 'blue', dots: [{ x: 30, y: 40 }] },
    ];
    const html = renderToStaticMarkup(
      createElement(ScatterPlot, { title: '키워드', groups, showLegend: false }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    expect(html).toContain(`fill="${CHART_COLORS.blue}"`);
  });
});
