import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DonutChart } from '../DonutChart';
import { CHART_COLORS } from '@/lib/chart-colors';

/**
 * 사이클 S Step S-1 — DonutChart hex color 지원 검증.
 * NODE_ENV=production으로 dev warn 격리.
 */
describe('DonutChart hex color 지원 (사이클 S Step S-1)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hex 코드 직접 → fill 적용', () => {
    const html = renderToStaticMarkup(
      createElement(DonutChart, {
        title: 'hex 테스트',
        data: [
          { label: 'A', value: 30, color: '#9ca3af' },
          { label: 'B', value: 70, color: '#dc2626' },
        ],
      }),
    );
    expect(html).toContain('fill="#9ca3af"');
    expect(html).toContain('fill="#dc2626"');
  });

  it('키워드 → 회귀 0 (CHART_COLORS hex로 렌더)', () => {
    const html = renderToStaticMarkup(
      createElement(DonutChart, {
        title: '키워드',
        data: [
          { label: 'A', value: 30, color: 'red' },
          { label: 'B', value: 70, color: 'blue' },
        ],
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    expect(html).toContain(`fill="${CHART_COLORS.blue}"`);
  });
});
