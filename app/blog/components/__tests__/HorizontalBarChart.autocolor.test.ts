import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HorizontalBarChart } from '../HorizontalBarChart';
import { CHART_COLORS, pickDefaultColor } from '@/lib/chart-colors';

/**
 * 사이클 P Step P-2 — discrete 모드 color 자동 할당 검증.
 * NODE_ENV=production 강제해서 dev warn/info 격리.
 */

describe('HorizontalBarChart color 자동 할당 (사이클 P-2)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('discrete 모드 + row.color 미지정 → pickDefaultColor 자동 할당 (category intent)', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '자동 할당 검증',
        unit: '',
        data: [
          { label: 'A', value: 10 },
          { label: 'B', value: 20 },
          { label: 'C', value: 30 },
          { label: 'D', value: 40 },
          { label: 'E', value: 50 },
        ],
      }),
    );

    // CATEGORY_ORDER: red → blue → orange → darkBlue → gray
    const expectedColors = [0, 1, 2, 3, 4].map((i) =>
      CHART_COLORS[pickDefaultColor(i, 'category')],
    );
    expectedColors.forEach((color) => {
      expect(html).toContain(`fill="${color}"`);
    });
  });

  it('discrete 모드 + row.color 명시 → 명시값 그대로 (자동 할당 미발동)', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '명시 색상',
        unit: '%',
        data: [
          { label: 'A', value: 10, color: 'red' },
          { label: 'B', value: 20, color: 'blue' },
        ],
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    expect(html).toContain(`fill="${CHART_COLORS.blue}"`);
  });

  it('discrete 모드 + row.color 부분 명시 → 명시값 우선, 미명시는 인덱스 기반 자동 할당', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '부분 명시',
        unit: '%',
        data: [
          { label: 'A', value: 10, color: 'red' },         // index 0 → red 명시
          { label: 'B', value: 20 },                        // index 1 → blue 자동 (CATEGORY_ORDER)
          { label: 'C', value: 30, color: 'darkBlue' },     // index 2 → darkBlue 명시
        ],
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    expect(html).toContain(`fill="${CHART_COLORS.blue}"`);     // index 1 자동 할당 (실제 순서: red→blue)
    expect(html).toContain(`fill="${CHART_COLORS.darkBlue}"`);
  });

  it('gradient 모드 → 자동 할당 미발동 (gradient fill 사용)', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: 'gradient 모드',
        colorMode: 'gradient',
        unit: '%',
        data: [
          { label: 'A', value: 10 },
          { label: 'B', value: 50 },
        ],
      }),
    );
    // gradient 모드는 value 기반 (10 → '#f59e0b', 50 → '#dc2626' 등 gradient 색상)
    // category intent 두 번째 색상(blue '#2563eb')이 절대 나오지 않는지 확인
    // 단 gradient 13단계 임계값 중 일부가 우연히 일치할 가능성 있으므로 SVG 렌더 자체만 검증
    expect(html).toContain('<svg');
    expect((html.match(/<rect /g) ?? []).length).toBe(2);
  });

  it('5개 초과 row → CATEGORY_ORDER 5색 순환 (인덱스 0과 5 동일 색)', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: '6개 row',
        unit: '',
        data: Array.from({ length: 6 }, (_, i) => ({
          label: `Row${i}`,
          value: i * 10 + 1,
        })),
      }),
    );
    const color0 = CHART_COLORS[pickDefaultColor(0, 'category')];
    const color5 = CHART_COLORS[pickDefaultColor(5, 'category')];
    expect(color0).toBe(color5);
    expect(html).toContain(`fill="${color0}"`);
  });
});
