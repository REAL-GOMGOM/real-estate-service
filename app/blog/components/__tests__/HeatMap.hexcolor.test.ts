import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HeatMap } from '../HeatMap';
import { getGradientFill } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 2 — HeatMap colorScale 검증.
 * HeatMap은 이산 color prop 없음. colorScale 함수로 hex 반환 케이스 검증.
 * Phase 1 통일 패턴: NODE_ENV stub 없음.
 */
describe('HeatMap colorScale (사이클 O Phase 2)', () => {
  it('colorScale이 hex 반환 → fill에 그대로', () => {
    const customScale = (v: number) => v > 0 ? '#9ca3af' : '#dc2626';
    const html = renderToStaticMarkup(
      createElement(HeatMap, {
        title: 'colorScale',
        rows: ['r1'],
        cols: ['c1', 'c2'],
        values: [[10, -5]],
        colorScale: customScale,
      }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain('fill="#dc2626"');
  });

  it('colorScale 미지정 → getGradientFill 회귀 (default)', () => {
    const html = renderToStaticMarkup(
      createElement(HeatMap, {
        title: 'default gradient',
        rows: ['r1'],
        cols: ['c1', 'c2'],
        values: [[20, -3]],
      }),
    );
    // value 20 → red 최대 단계, value -3 → blue
    expect(html).toContain(`fill="${getGradientFill(20)}"`);
    expect(html).toContain(`fill="${getGradientFill(-3)}"`);
  });
});
