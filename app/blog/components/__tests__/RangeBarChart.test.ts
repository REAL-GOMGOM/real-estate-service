import { describe, it, expect } from 'vitest';
import {
  computeRangeDomain,
  mapValueToX,
  computeBarGeometry,
  resolveRangeColor,
  computeMidpoint,
  generateAriaDesc,
  MIN_BAR_WIDTH,
  type RangeItem,
} from '../RangeBarChart.utils';
import { CHART_COLORS } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 2 — RangeBarChart 단위 테스트.
 * floating bar geometry / category intent / 점 막대 가드 핵심.
 */

const PLOT = { x: 100, y: 50, width: 480, height: 200 };

const SAMPLE: RangeItem[] = [
  { label: '강남자이', min: 22, max: 38 },
  { label: '래미안',   min: 18, max: 30 },
  { label: '디에이치', min: 25, max: 32 },
];

describe('computeRangeDomain', () => {
  it('정상 — 전체 min/max에 5% 패딩', () => {
    // 전체 min 18, max 38, range 20, pad 1
    const d = computeRangeDomain(SAMPLE);
    expect(d.min).toBeCloseTo(17, 2);
    expect(d.max).toBeCloseTo(39, 2);
  });

  it('사용자 domainMin/Max override', () => {
    const d = computeRangeDomain(SAMPLE, 0, 50);
    expect(d).toEqual({ min: 0, max: 50 });
  });

  it('한쪽만 override 가능', () => {
    const d = computeRangeDomain(SAMPLE, 0);
    expect(d.min).toBe(0);
    expect(d.max).toBeCloseTo(39, 2);
  });

  it('빈 items → safe placeholder', () => {
    const d = computeRangeDomain([]);
    expect(d.max).toBeGreaterThan(d.min);
  });

  it('모두 동일 값 → ±1 강제 (0폭 방지)', () => {
    const items: RangeItem[] = [{ label: 'A', min: 10, max: 10 }];
    const d = computeRangeDomain(items);
    expect(d).toEqual({ min: 9, max: 11 });
  });
});

describe('mapValueToX', () => {
  it('도메인 양 끝 → plotArea 양 끝', () => {
    expect(mapValueToX(0,   { min: 0, max: 100 }, PLOT)).toBe(100);
    expect(mapValueToX(100, { min: 0, max: 100 }, PLOT)).toBe(580);
  });

  it('중앙값 → plotArea 중앙', () => {
    expect(mapValueToX(50, { min: 0, max: 100 }, PLOT)).toBe(340);
  });

  it('도메인 0폭 가드 → plotArea 가운데', () => {
    expect(mapValueToX(5, { min: 5, max: 5 }, PLOT)).toBe(340);
  });
});

describe('computeBarGeometry (floating bar)', () => {
  it('정상 — x = mapValueToX(min), width = max-min 매핑', () => {
    const item: RangeItem = { label: 'A', min: 20, max: 40 };
    const { x, width } = computeBarGeometry(item, { min: 0, max: 100 }, PLOT);
    // mapValueToX(20) = 196, mapValueToX(40) = 292, width 96
    expect(x).toBe(196);
    expect(width).toBe(96);
  });

  it('min==max → 점 막대 (MIN_BAR_WIDTH=2px 가드)', () => {
    const item: RangeItem = { label: 'A', min: 30, max: 30 };
    const { width } = computeBarGeometry(item, { min: 0, max: 100 }, PLOT);
    expect(width).toBe(MIN_BAR_WIDTH);
  });

  it('max<min 입력 → swap 후 처리 (회귀 안전)', () => {
    const item: RangeItem = { label: 'A', min: 40, max: 20 };
    const { x, width } = computeBarGeometry(item, { min: 0, max: 100 }, PLOT);
    // swap 결과: lo=20, hi=40 → 정상 케이스와 동일
    expect(x).toBe(196);
    expect(width).toBe(96);
  });

  it('도메인 양 끝 항목 — 막대가 plotArea 안에 위치', () => {
    const item: RangeItem = { label: 'A', min: 0, max: 100 };
    const { x, width } = computeBarGeometry(item, { min: 0, max: 100 }, PLOT);
    expect(x).toBe(PLOT.x);
    expect(width).toBe(PLOT.width);
  });
});

describe('resolveRangeColor', () => {
  it('index 0 → red (category intent, 단일 항목 fallback 없음)', () => {
    const item: RangeItem = { label: 'A', min: 0, max: 10 };
    expect(resolveRangeColor(item, 0)).toBe(CHART_COLORS.red);
  });

  it('index 1 → blue, index 2 → orange (CATEGORY_ORDER)', () => {
    const item: RangeItem = { label: 'A', min: 0, max: 10 };
    expect(resolveRangeColor(item, 1)).toBe(CHART_COLORS.blue);
    expect(resolveRangeColor(item, 2)).toBe(CHART_COLORS.orange);
  });

  it('color 명시 (hex/키워드) → 그대로', () => {
    const i1: RangeItem = { label: 'A', min: 0, max: 10, color: 'darkBlue' };
    const i2: RangeItem = { label: 'B', min: 0, max: 10, color: '#9ca3af' };
    expect(resolveRangeColor(i1, 0)).toBe(CHART_COLORS.darkBlue);
    expect(resolveRangeColor(i2, 0)).toBe('#9ca3af');
  });
});

describe('computeMidpoint', () => {
  it('(min + max) / 2', () => {
    expect(computeMidpoint({ label: 'A', min: 10, max: 30 })).toBe(20);
    expect(computeMidpoint({ label: 'A', min: -5, max: 5 })).toBe(0);
    expect(computeMidpoint({ label: 'A', min: 7, max: 7 })).toBe(7);
  });
});

describe('generateAriaDesc', () => {
  it('빈 items → 빈 메시지', () => {
    expect(generateAriaDesc([], '억')).toBe('데이터가 없는 빈 범위 막대 차트');
  });

  it('항목 수 + 라벨 + 전체 범위', () => {
    const desc = generateAriaDesc(SAMPLE, '억');
    expect(desc).toContain('3개 항목');
    expect(desc).toContain('강남자이, 래미안, 디에이치');
    expect(desc).toContain('18.0억');
    expect(desc).toContain('38.0억');
  });
});

// ─── 렌더 테스트 ───
describe('RangeBarChart render', () => {
  it('빈 데이터 → placeholder', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RangeBarChart } = await import('../RangeBarChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(RangeBarChart, { title: '빈', items: [] }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('데이터 없음');
  });

  it('정상 → 항목 수만큼 막대 + index 0 red', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RangeBarChart } = await import('../RangeBarChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(RangeBarChart, {
        title: '시세 밴드',
        unit: '억',
        items: SAMPLE,
      }),
    );
    // 막대 rect는 항목당 1개. tick 라벨 rect는 없음(line만).
    const barRectCount = (html.match(/<rect /g) ?? []).length;
    expect(barRectCount).toBe(3);
    expect(html).toContain(`fill="${CHART_COLORS.red}"`); // index 0
  });

  it('showMidpoint=true → 중앙 세로선 표시', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RangeBarChart } = await import('../RangeBarChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(RangeBarChart, {
        title: '중앙값',
        items: [{ label: 'A', min: 10, max: 30 }],
        showMidpoint: true,
      }),
    );
    // 중앙선 stroke=#ffffff (흰색)
    expect(html).toContain('stroke="#ffffff"');
  });

  it('showValues=false → min/max 텍스트 라벨 없음', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { RangeBarChart } = await import('../RangeBarChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(RangeBarChart, {
        title: 'no values',
        unit: '억',
        items: [{ label: 'A', min: 10, max: 30 }],
        showValues: false,
      }),
    );
    // 값 라벨 ">10억<" / ">30억<" 형식 미존재. (label만 있음)
    expect(html).not.toContain('>10억<');
    expect(html).not.toContain('>30억<');
  });
});
