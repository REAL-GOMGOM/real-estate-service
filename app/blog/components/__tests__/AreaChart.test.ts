import { describe, it, expect } from 'vitest';
import {
  computeAreaDomain,
  computeStackedValues,
  buildStackedAreaPath,
  resolveAreaColor,
  generateAriaDesc,
  collectXValues,
  type AreaSeries,
} from '../AreaChart.utils';
import { CHART_COLORS } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 1 — AreaChart 단위 테스트.
 * 도메인·누적값·면적 path·색상·ariaDesc·렌더 검증.
 */

const SAMPLE_TWO_SERIES: AreaSeries[] = [
  { name: 'A', data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }, { x: 'Q3', y: 30 }] },
  { name: 'B', data: [{ x: 'Q1', y: 5  }, { x: 'Q2', y: 15 }, { x: 'Q3', y: 25 }] },
];

describe('computeAreaDomain', () => {
  it('default — min=0, max=dataMax (단일 시리즈)', () => {
    const series: AreaSeries[] = [{ name: 'A', data: [{ x: '1', y: 10 }, { x: '2', y: 20 }] }];
    expect(computeAreaDomain(series)).toEqual({ min: 0, max: 20 });
  });

  it('autoBaseline 적용 — dataMin - range × 0.1', () => {
    const series: AreaSeries[] = [{ name: 'A', data: [{ x: 1, y: 100 }, { x: 2, y: 110 }] }];
    const d = computeAreaDomain(series, undefined, true);
    expect(d.min).toBeCloseTo(99, 1);
    expect(d.max).toBe(110);
  });

  it('maxValue clamp — 상한 강제', () => {
    const series: AreaSeries[] = [{ name: 'A', data: [{ x: 1, y: 5 }, { x: 2, y: 80 }] }];
    expect(computeAreaDomain(series, 0, false, 50)).toEqual({ min: 0, max: 50 });
  });

  it('stacked=true — 각 x에서 시리즈 합의 최대값을 도메인 상한으로', () => {
    // A+B: Q1=15, Q2=35, Q3=55 → max 55
    const d = computeAreaDomain(SAMPLE_TWO_SERIES, undefined, false, undefined, true);
    expect(d.min).toBe(0);
    expect(d.max).toBe(55);
  });

  it('빈 데이터 → safe placeholder', () => {
    expect(computeAreaDomain([])).toEqual({ min: 0, max: 1 });
    expect(computeAreaDomain([{ name: 'A', data: [] }])).toEqual({ min: 0, max: 1 });
  });
});

describe('computeStackedValues', () => {
  it('A+B 누적 정확 (xValues 순서 유지)', () => {
    const xs = collectXValues(SAMPLE_TWO_SERIES);
    const totals = computeStackedValues(SAMPLE_TWO_SERIES, xs);
    expect(totals.get('A')).toEqual([10, 20, 30]); // 첫 시리즈는 자기값 그대로
    expect(totals.get('B')).toEqual([15, 35, 55]); // A+B 누적
  });

  it('시리즈가 같은 x에 점이 없으면 0으로 처리 (누적 영향 없음)', () => {
    const series: AreaSeries[] = [
      { name: 'A', data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }] },
      { name: 'B', data: [{ x: 'Q2', y: 5 }] }, // Q1에 점 없음
    ];
    const xs = collectXValues(series);
    const totals = computeStackedValues(series, xs);
    expect(totals.get('A')).toEqual([10, 20]);
    expect(totals.get('B')).toEqual([10, 25]); // Q1은 0+10=10, Q2는 20+5=25
  });
});

describe('buildStackedAreaPath', () => {
  it('상단 + 하단(역순) 닫힌 path (M ... L ... Z)', () => {
    const upper = [{ cx: 0, cy: 10 }, { cx: 10, cy: 5 }, { cx: 20, cy: 8 }];
    const lower = [{ cx: 0, cy: 50 }, { cx: 10, cy: 50 }, { cx: 20, cy: 50 }];
    const path = buildStackedAreaPath(upper, lower);
    expect(path).toBe('M 0 10 L 10 5 L 20 8 L 20 50 L 10 50 L 0 50 Z');
  });

  it('빈 배열 또는 길이 불일치 → 빈 문자열', () => {
    expect(buildStackedAreaPath([], [])).toBe('');
    expect(buildStackedAreaPath([{ cx: 0, cy: 0 }], [])).toBe('');
    expect(buildStackedAreaPath(
      [{ cx: 0, cy: 0 }, { cx: 10, cy: 10 }],
      [{ cx: 0, cy: 50 }],
    )).toBe('');
  });
});

describe('resolveAreaColor', () => {
  it('단일 시리즈 + color 미지정 → blue 강제 (LineChart 정책 동일)', () => {
    const s: AreaSeries = { name: 'A', data: [] };
    expect(resolveAreaColor(s, 0, 1)).toBe(CHART_COLORS.blue);
  });

  it('다중 시리즈 + color 미지정 → SERIES_ORDER (gray, red, ...)', () => {
    const s1: AreaSeries = { name: 'A', data: [] };
    const s2: AreaSeries = { name: 'B', data: [] };
    expect(resolveAreaColor(s1, 0, 2)).toBe(CHART_COLORS.gray);
    expect(resolveAreaColor(s2, 1, 2)).toBe(CHART_COLORS.red);
  });

  it('color 명시 → hex/키워드 통합 (단일 시리즈에서도 명시값 우선)', () => {
    const s1: AreaSeries = { name: 'A', color: 'darkBlue', data: [] };
    const s2: AreaSeries = { name: 'B', color: '#9ca3af', data: [] };
    expect(resolveAreaColor(s1, 0, 1)).toBe(CHART_COLORS.darkBlue);
    expect(resolveAreaColor(s2, 0, 1)).toBe('#9ca3af');
  });
});

describe('generateAriaDesc', () => {
  it('빈 시리즈 → 빈 차트 메시지', () => {
    expect(generateAriaDesc([], '%')).toBe('데이터가 없는 빈 면적 차트');
  });

  it('비누적 모드 → 시리즈 수·값 범위 포함', () => {
    const desc = generateAriaDesc(SAMPLE_TWO_SERIES, '%');
    expect(desc).toContain('2개 시리즈');
    expect(desc).toContain('A, B');
    expect(desc).toContain('5.0%');
    expect(desc).toContain('30.0%');
  });

  it('stacked 모드 → 합계 범위 포함', () => {
    const desc = generateAriaDesc(SAMPLE_TWO_SERIES, '%', true);
    expect(desc).toContain('누적');
    expect(desc).toContain('15.0%'); // Q1 합
    expect(desc).toContain('55.0%'); // Q3 합
  });
});

// ─── 렌더 테스트 ───
// NODE_ENV stub 미사용: vitest 동적 import + prod stub 조합이 jsxDEV 누락을 유발.
// LineChart.test.ts와 동일 패턴(stub 없음). 본 케이스는 모두 color undefined라 warn 미발동.
describe('AreaChart render', () => {
  it('빈 데이터 → placeholder + role/title/desc', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { AreaChart } = await import('../AreaChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(AreaChart, { title: '빈 차트', series: [] }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('<title');
    expect(html).toContain('빈 차트');
    expect(html).toContain('데이터 없음');
  });

  it('단일 시리즈 면적 → path fill + 선 stroke + blue fallback', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { AreaChart } = await import('../AreaChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(AreaChart, {
        title: '단일',
        series: [{ name: 'A', data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 20 }, { x: 'Q3', y: 30 }] }],
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.blue}"`);
    expect(html).toContain(`stroke="${CHART_COLORS.blue}"`);
    expect(html).toContain('fill-opacity="0.25"');
  });

  it('stacked 다중 시리즈 → 각 시리즈 누적 면적 path', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { AreaChart } = await import('../AreaChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(AreaChart, {
        title: '누적',
        series: SAMPLE_TWO_SERIES,
        stacked: true,
      }),
    );
    // stacked 시리즈 두 개 → 적어도 면적 path 2건 + 선 path 2건 = path 4건 이상
    const pathCount = (html.match(/<path /g) ?? []).length;
    expect(pathCount).toBeGreaterThanOrEqual(4);
    // stacked opacity 적용 확인
    expect(html).toContain('fill-opacity="0.85"');
  });
});
