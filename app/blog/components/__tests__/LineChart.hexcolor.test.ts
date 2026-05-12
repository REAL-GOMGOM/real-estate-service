import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { LineChart } from '../LineChart';
import { CHART_COLORS } from '@/lib/chart-colors';
import type { LineSeries } from '../LineChart.utils';

/**
 * 사이클 S Step S-1 — LineChart hex color 지원 검증.
 * series intent + 단일 시리즈 blue fallback 동작도 함께 확인.
 * NODE_ENV=production으로 dev warn 격리.
 */
describe('LineChart hex color 지원 (사이클 S Step S-1)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hex 코드 직접 → stroke 적용 (단일 시리즈 blue fallback 무시)', () => {
    const series: LineSeries[] = [{
      name: 'A',
      color: '#9ca3af',
      data: [{ x: 1, y: 10 }, { x: 2, y: 20 }],
    }];
    const html = renderToStaticMarkup(
      createElement(LineChart, { title: 'hex', series }),
    );
    expect(html).toContain('stroke="#9ca3af"');
    // 단일 시리즈 blue fallback이 hex 명시값을 덮지 않음
    expect(html).not.toContain(`stroke="${CHART_COLORS.blue}"`);
  });

  it('다중 시리즈 hex + 키워드 혼재 → 각각 정상 렌더', () => {
    const series: LineSeries[] = [
      { name: 'A', color: '#9ca3af', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }] },
      { name: 'B', color: 'red',     data: [{ x: 1, y: 15 }, { x: 2, y: 25 }] },
    ];
    const html = renderToStaticMarkup(
      createElement(LineChart, { title: '혼재', series, showLegend: false }),
    );
    expect(html).toContain('stroke="#9ca3af"');
    expect(html).toContain(`stroke="${CHART_COLORS.red}"`);
  });
});
