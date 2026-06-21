import { describe, it, expect } from 'vitest';
import {
  computeScatterDomain,
  mapDotToCoord,
  resolveGroupColor,
  generateAriaDesc,
  type ScatterGroup,
} from '../ScatterPlot.utils';
import { CHART_COLORS } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 1 — ScatterPlot 단위 테스트.
 * 양축 도메인·좌표 매핑·색상·ariaDesc·렌더 검증.
 */

const PLOT = { x: 60, y: 60, width: 540, height: 280 };

const SAMPLE: ScatterGroup[] = [
  { name: '강남', dots: [{ x: 30, y: 50 }, { x: 40, y: 70 }, { x: 50, y: 90 }] },
  { name: '서초', dots: [{ x: 25, y: 45 }, { x: 35, y: 65 }] },
];

describe('computeScatterDomain', () => {
  it('auto — dataMin·dataMax + 5% 패딩', () => {
    // x 값: 25, 30, 35, 40, 50 → min 25, max 50, range 25, pad 1.25
    const d = computeScatterDomain(SAMPLE, 'x');
    expect(d.min).toBeCloseTo(23.75, 2);
    expect(d.max).toBeCloseTo(51.25, 2);
  });

  it('사용자 min/max override (한쪽만도 가능)', () => {
    const d1 = computeScatterDomain(SAMPLE, 'x', 0, 100);
    expect(d1).toEqual({ min: 0, max: 100 });
    const d2 = computeScatterDomain(SAMPLE, 'x', 0);
    expect(d2.min).toBe(0);
    expect(d2.max).toBeCloseTo(51.25, 2); // max는 auto
  });

  it('단일 점(min==max) → ±1 패딩으로 0폭 방지', () => {
    const single: ScatterGroup[] = [{ name: 'A', dots: [{ x: 10, y: 20 }] }];
    const dx = computeScatterDomain(single, 'x');
    expect(dx).toEqual({ min: 9, max: 11 });
    const dy = computeScatterDomain(single, 'y');
    expect(dy).toEqual({ min: 19, max: 21 });
  });

  it('빈 데이터 → safe placeholder', () => {
    const d = computeScatterDomain([], 'x');
    expect(d.max).toBeGreaterThan(d.min);
    const dWithUser = computeScatterDomain([], 'x', 0, 100);
    expect(dWithUser).toEqual({ min: 0, max: 100 });
  });

  it('사용자 값이 도메인 뒤집은 경우 보호', () => {
    const d = computeScatterDomain(SAMPLE, 'x', 100, 50);
    expect(d.max).toBeGreaterThan(d.min);
  });
});

describe('mapDotToCoord', () => {
  it('좌하 모서리 점 → plotArea 좌하', () => {
    const r = mapDotToCoord(
      { x: 0, y: 0 },
      { min: 0, max: 100 },
      { min: 0, max: 100 },
      PLOT,
    );
    expect(r.cx).toBe(PLOT.x);
    expect(r.cy).toBe(PLOT.y + PLOT.height);
  });

  it('우상 모서리 점 → plotArea 우상', () => {
    const r = mapDotToCoord(
      { x: 100, y: 100 },
      { min: 0, max: 100 },
      { min: 0, max: 100 },
      PLOT,
    );
    expect(r.cx).toBe(PLOT.x + PLOT.width);
    expect(r.cy).toBe(PLOT.y);
  });

  it('중앙 점 → plotArea 중앙', () => {
    const r = mapDotToCoord(
      { x: 50, y: 50 },
      { min: 0, max: 100 },
      { min: 0, max: 100 },
      PLOT,
    );
    expect(r.cx).toBe(PLOT.x + PLOT.width / 2);
    expect(r.cy).toBe(PLOT.y + PLOT.height / 2);
  });

  it('도메인 0폭 가드 (xRange==0 → 가운데)', () => {
    const r = mapDotToCoord(
      { x: 5, y: 50 },
      { min: 5, max: 5 },
      { min: 0, max: 100 },
      PLOT,
    );
    expect(r.cx).toBe(PLOT.x + PLOT.width / 2);
  });
});

describe('resolveGroupColor', () => {
  it('index 0 → red (category intent, 강조 시작 — 단일 그룹 fallback 없음)', () => {
    const g: ScatterGroup = { name: 'A', dots: [] };
    expect(resolveGroupColor(g, 0)).toBe(CHART_COLORS.red);
  });

  it('index 1 → blue (CATEGORY_ORDER)', () => {
    const g: ScatterGroup = { name: 'B', dots: [] };
    expect(resolveGroupColor(g, 1)).toBe(CHART_COLORS.blue);
  });

  it('color 명시 (hex/키워드) → 그대로', () => {
    const g1: ScatterGroup = { name: 'A', color: 'darkBlue', dots: [] };
    const g2: ScatterGroup = { name: 'B', color: '#9ca3af', dots: [] };
    expect(resolveGroupColor(g1, 0)).toBe(CHART_COLORS.darkBlue);
    expect(resolveGroupColor(g2, 0)).toBe('#9ca3af');
  });
});

describe('generateAriaDesc', () => {
  it('빈 그룹 → 빈 메시지', () => {
    expect(generateAriaDesc([], '평', '억')).toBe('데이터가 없는 빈 산점도');
  });

  it('점 0개 그룹 → 데이터 없음 메시지', () => {
    expect(generateAriaDesc([{ name: 'A', dots: [] }], '평', '억')).toContain('데이터 없음');
  });

  it('그룹/점/축 범위 포함', () => {
    const desc = generateAriaDesc(SAMPLE, '평', '억');
    expect(desc).toContain('2개 그룹');
    expect(desc).toContain('강남, 서초');
    expect(desc).toContain('총 5개 점');
    expect(desc).toContain('25.0평');
    expect(desc).toContain('50.0평');
    expect(desc).toContain('45.0억');
    expect(desc).toContain('90.0억');
  });
});

// ─── 렌더 테스트 (stub 없음 — Step 1과 동일 패턴) ───
describe('ScatterPlot render', () => {
  it('빈 데이터 → placeholder + role/title/desc', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ScatterPlot } = await import('../ScatterPlot');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(ScatterPlot, { title: '빈 산점도', groups: [] }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('<title');
    expect(html).toContain('빈 산점도');
    expect(html).toContain('데이터 없음');
  });

  it('단일 그룹 → red 시작 + circle 점 개수 정확', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ScatterPlot } = await import('../ScatterPlot');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(ScatterPlot, {
        title: '단일',
        groups: [{ name: 'A', dots: [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }] }],
      }),
    );
    expect(html).toContain(`fill="${CHART_COLORS.red}"`);
    const circleCount = (html.match(/<circle /g) ?? []).length;
    expect(circleCount).toBe(3); // legend 없음(단일 그룹 default) → 점 3개만
  });

  it('label 옵션 → 점 옆에 텍스트 렌더', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ScatterPlot } = await import('../ScatterPlot');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(ScatterPlot, {
        title: '라벨',
        groups: [{ name: 'A', dots: [{ x: 10, y: 20, label: '강남구' }] }],
      }),
    );
    expect(html).toContain('강남구');
  });
});
