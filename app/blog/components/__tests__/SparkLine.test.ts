import { describe, it, expect } from 'vitest';
import {
  computeSparkDomain,
  mapSparkPoints,
  resolveSparkColor,
  buildSparkPath,
  buildSparkArea,
} from '../SparkLine.utils';
import { CHART_COLORS } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 1 — SparkLine 단위 테스트.
 * 도메인 패딩·좌표·3-way 색상·path·렌더 검증.
 */

describe('computeSparkDomain', () => {
  it('정상 데이터 → min·max에 10% 패딩', () => {
    const d = computeSparkDomain([10, 20, 30]);
    // range 20, pad 2 → min 8, max 32
    expect(d.min).toBeCloseTo(8, 5);
    expect(d.max).toBeCloseTo(32, 5);
  });

  it('단일 값 → ±1 강제 (0폭 방지)', () => {
    expect(computeSparkDomain([10])).toEqual({ min: 9, max: 11 });
  });

  it('모두 동일 값 → ±1 강제', () => {
    expect(computeSparkDomain([5, 5, 5])).toEqual({ min: 4, max: 6 });
  });

  it('빈 배열 → safe placeholder', () => {
    expect(computeSparkDomain([])).toEqual({ min: 0, max: 1 });
  });
});

describe('mapSparkPoints', () => {
  it('정상 — 인덱스 균등 + y 반전', () => {
    const pts = mapSparkPoints([10, 20, 30], { min: 0, max: 30 }, 120, 32, 2);
    expect(pts).toHaveLength(3);
    expect(pts[0].cx).toBe(2); // 첫 점 — padding
    expect(pts[2].cx).toBe(118); // 마지막 점 — width - padding
    // y는 반전: 30(max)는 padding 위치, 10은 아래
    expect(pts[2].cy).toBeLessThan(pts[0].cy);
  });

  it('단일 점 → 가운데 배치', () => {
    const pts = mapSparkPoints([5], { min: 4, max: 6 }, 120, 32, 2);
    expect(pts[0].cx).toBe(60); // padding + innerW/2 = 2 + 116/2 = 60
  });

  it('빈 배열 → 빈 배열', () => {
    expect(mapSparkPoints([], { min: 0, max: 1 }, 120, 32, 2)).toEqual([]);
  });
});

describe('resolveSparkColor (3-way 분기)', () => {
  it('color 명시 → resolveChartColor (hex/키워드)', () => {
    expect(resolveSparkColor([10, 20], 'darkBlue')).toBe(CHART_COLORS.darkBlue);
    expect(resolveSparkColor([10, 20], '#9ca3af')).toBe('#9ca3af');
  });

  it('color 없고 trendColor=true + 상승(첫<끝) → red', () => {
    expect(resolveSparkColor([10, 20, 30], undefined, true)).toBe(CHART_COLORS.red);
  });

  it('color 없고 trendColor=true + 하락(첫>끝) → blue', () => {
    expect(resolveSparkColor([30, 20, 10], undefined, true)).toBe(CHART_COLORS.blue);
  });

  it('color 없고 trendColor=true + 평평(첫==끝) → gray', () => {
    expect(resolveSparkColor([10, 20, 10], undefined, true)).toBe(CHART_COLORS.gray);
  });

  it('color 없고 trendColor=true + 단일 값/빈 배열 → gray (추세 판정 불가)', () => {
    expect(resolveSparkColor([5], undefined, true)).toBe(CHART_COLORS.gray);
    expect(resolveSparkColor([], undefined, true)).toBe(CHART_COLORS.gray);
  });

  it('color 없고 trendColor=false → gray', () => {
    expect(resolveSparkColor([10, 20, 30], undefined, false)).toBe(CHART_COLORS.gray);
    expect(resolveSparkColor([10, 20, 30], undefined, undefined)).toBe(CHART_COLORS.gray);
  });
});

describe('buildSparkPath / buildSparkArea', () => {
  it('buildSparkPath — M + L 연결', () => {
    const path = buildSparkPath([{ cx: 0, cy: 10 }, { cx: 10, cy: 5 }, { cx: 20, cy: 8 }]);
    expect(path).toBe('M 0 10 L 10 5 L 20 8');
  });

  it('buildSparkArea — baselineY까지 닫힘', () => {
    const area = buildSparkArea([{ cx: 0, cy: 10 }, { cx: 20, cy: 5 }], 30);
    expect(area).toBe('M 0 30 L 0 10 L 20 5 L 20 30 Z');
  });

  it('빈 배열 → 빈 문자열', () => {
    expect(buildSparkPath([])).toBe('');
    expect(buildSparkArea([], 30)).toBe('');
  });
});

// ─── 렌더 테스트 ───
describe('SparkLine render', () => {
  it('정상 데이터 + 추세 상승 → red stroke + 끝점 dot', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { SparkLine } = await import('../SparkLine');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(SparkLine, {
        data: [10, 20, 30],
        ariaLabel: '강남 시세 추이',
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="강남 시세 추이"');
    expect(html).toContain(`stroke="${CHART_COLORS.red}"`);
    expect(html).toContain('<circle'); // endDot 기본 true
  });

  it('showEndDot=false → circle 없음', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { SparkLine } = await import('../SparkLine');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(SparkLine, {
        data: [10, 20, 30],
        showEndDot: false,
        ariaLabel: 'no dot',
      }),
    );
    expect((html.match(/<circle /g) ?? []).length).toBe(0);
  });

  it('showArea=true → 면적 path (fill-opacity)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { SparkLine } = await import('../SparkLine');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(SparkLine, {
        data: [10, 20, 30],
        showArea: true,
        ariaLabel: 'area',
      }),
    );
    expect(html).toContain('fill-opacity="0.2"');
  });

  it('빈 데이터 → 점선 placeholder', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { SparkLine } = await import('../SparkLine');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(SparkLine, { data: [], ariaLabel: '데이터 없음' }),
    );
    expect(html).toContain('aria-label="데이터 없음"');
    expect(html).toContain('stroke-dasharray="2 2"');
    expect(html).not.toContain('<path'); // path 없음
  });
});
