import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ScatterPlot } from '../ScatterPlot';
import { CHART_COLORS } from '@/lib/chart-colors';
import type { ScatterGroup } from '../ScatterPlot.utils';

/**
 * 사이클 O Phase 1 — ScatterPlot hex color 지원 검증.
 * 통일된 패턴: NODE_ENV stub 없음 (정상 입력이라 dev warn 미발동).
 */
describe('ScatterPlot hex color 지원 (사이클 O Phase 1)', () => {
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
