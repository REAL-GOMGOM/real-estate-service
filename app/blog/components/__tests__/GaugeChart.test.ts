import { describe, it, expect } from 'vitest';
import {
  valueToAngle,
  polarToCartesian,
  buildArcPath,
  clampValue,
  resolveGaugeColor,
  generateAriaDesc,
  BACKGROUND_ARC_FILL,
  type GaugeZone,
} from '../GaugeChart.utils';
import { CHART_COLORS, getGradientFill } from '@/lib/chart-colors';

/**
 * 사이클 O Phase 2 — GaugeChart 단위 테스트.
 * arc 수학(polarToCartesian, buildArcPath)이 회귀 위험 최상위 — 두텁게 검증.
 */

describe('valueToAngle (선형 보간)', () => {
  it('value=min → startAngle', () => {
    expect(valueToAngle(0, 0, 100, 180, 0)).toBe(180);
  });

  it('value=max → endAngle', () => {
    expect(valueToAngle(100, 0, 100, 180, 0)).toBe(0);
  });

  it('중간값 → 중간 각도 (default 180→0에서 value=50 → 90°)', () => {
    expect(valueToAngle(50, 0, 100, 180, 0)).toBe(90);
  });

  it('1/4 지점 → 3/4 각도 (default 180→0에서 value=25 → 135°)', () => {
    expect(valueToAngle(25, 0, 100, 180, 0)).toBe(135);
  });

  it('max<=min 가드 → startAngle 반환', () => {
    expect(valueToAngle(50, 100, 0, 180, 0)).toBe(180);
    expect(valueToAngle(50, 50, 50, 180, 0)).toBe(180);
  });
});

describe('polarToCartesian (SVG 좌표계 기준점)', () => {
  // SVG: y 아래로 증가, 0°=3시 시작 시계방향
  const cx = 100;
  const cy = 100;
  const r  = 50;

  it('0° → 3시 (cx+r, cy)', () => {
    const p = polarToCartesian(cx, cy, r, 0);
    expect(p.x).toBeCloseTo(150, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });

  it('90° → 6시 (cx, cy+r) — SVG y 아래로', () => {
    const p = polarToCartesian(cx, cy, r, 90);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(150, 5);
  });

  it('180° → 9시 (cx-r, cy)', () => {
    const p = polarToCartesian(cx, cy, r, 180);
    expect(p.x).toBeCloseTo(50, 5);
    expect(p.y).toBeCloseTo(100, 5);
  });

  it('270° → 12시 (cx, cy-r)', () => {
    const p = polarToCartesian(cx, cy, r, 270);
    expect(p.x).toBeCloseTo(100, 5);
    expect(p.y).toBeCloseTo(50, 5);
  });
});

describe('clampValue', () => {
  it('정상 범위 내 → 그대로', () => {
    expect(clampValue(50, 0, 100)).toBe(50);
  });

  it('상한 초과 → max', () => {
    expect(clampValue(150, 0, 100)).toBe(100);
  });

  it('하한 미만 → min', () => {
    expect(clampValue(-10, 0, 100)).toBe(0);
  });

  it('max<=min 가드 → min 반환', () => {
    expect(clampValue(50, 100, 0)).toBe(100);
    expect(clampValue(50, 50, 50)).toBe(50);
  });
});

describe('buildArcPath (두께 있는 호)', () => {
  // default 게이지: cx=100, cy=100, outerR=80, startAngle=180, endAngle=0, thickness=20
  const cx = 100;
  const cy = 100;
  const outerR = 80;
  const thickness = 20;

  it('M + A + L + A + Z 구조 (닫힌 경로)', () => {
    const path = buildArcPath(cx, cy, outerR, 180, 0, thickness);
    expect(path).toMatch(/^M /);
    expect(path).toMatch(/ Z$/);
    expect((path.match(/A /g) ?? []).length).toBe(2);
    expect((path.match(/L /g) ?? []).length).toBe(1);
  });

  it('반원(180°) → large-arc-flag=0 (180°는 작은 호 경계)', () => {
    const path = buildArcPath(cx, cy, outerR, 180, 0, thickness);
    // "outerR outerR 0 0 0|1 ..." 또는 "outerR outerR 0 0 1|0 ..." — large-arc-flag가 0
    expect(path).toMatch(/A 80 80 0 0 \d /);
  });

  it('200° 호 → large-arc-flag=1 (180° 초과)', () => {
    const path = buildArcPath(cx, cy, outerR, 200, 0, thickness);
    expect(path).toMatch(/A 80 80 0 1 \d /);
  });

  it('default 게이지(180→0): outer sweep=0(angle 감소), inner sweep=1(반전)', () => {
    const path = buildArcPath(cx, cy, outerR, 180, 0, thickness);
    // 외호 sweep=0, 내호 sweep=1
    expect(path).toMatch(/A 80 80 0 0 0 .+ A 60 60 0 0 1 /);
  });

  it('역방향(0→180, angle 증가): outer sweep=1, inner sweep=0', () => {
    const path = buildArcPath(cx, cy, outerR, 0, 180, thickness);
    expect(path).toMatch(/A 80 80 0 0 1 .+ A 60 60 0 0 0 /);
  });

  it('thickness >= outerRadius → innerR=0 (Pie형)', () => {
    const path = buildArcPath(cx, cy, outerR, 180, 0, 100); // thickness 100 > outerR 80
    expect(path).toMatch(/A 0 0 0 /);
  });
});

describe('resolveGaugeColor (우선순위 + 경계값)', () => {
  const zones: GaugeZone[] = [
    { upTo: 30, color: 'blue' },
    { upTo: 70, color: 'orange' },
    { upTo: 100, color: 'red' },
  ];

  it('zones 매칭 — 첫 구간(value <= 30)', () => {
    expect(resolveGaugeColor(15, zones)).toBe(CHART_COLORS.blue);
  });

  it('zones 경계값 — value==upTo는 해당 구간(<= 기준)', () => {
    // value=30 → 첫 구간(upTo=30) 매칭
    expect(resolveGaugeColor(30, zones)).toBe(CHART_COLORS.blue);
    // value=31 → 두 번째 구간
    expect(resolveGaugeColor(31, zones)).toBe(CHART_COLORS.orange);
    // value=70 → 두 번째 구간(upTo=70) 매칭
    expect(resolveGaugeColor(70, zones)).toBe(CHART_COLORS.orange);
  });

  it('zones 마지막 구간 — value=100은 upTo=100 매칭', () => {
    expect(resolveGaugeColor(100, zones)).toBe(CHART_COLORS.red);
  });

  it('zones 모든 구간 초과 → 마지막 구간색 fallback', () => {
    expect(resolveGaugeColor(150, zones)).toBe(CHART_COLORS.red);
  });

  it('zones 없고 color 명시 → resolveChartColor (intent series)', () => {
    expect(resolveGaugeColor(50, undefined, 'darkBlue')).toBe(CHART_COLORS.darkBlue);
    expect(resolveGaugeColor(50, undefined, '#9ca3af')).toBe('#9ca3af');
  });

  it('zones 없고 color 없음 → getGradientFill(value)', () => {
    expect(resolveGaugeColor(20)).toBe(getGradientFill(20));
    expect(resolveGaugeColor(-3)).toBe(getGradientFill(-3));
  });

  it('zones 빈 배열 → color 또는 gradient fallback', () => {
    expect(resolveGaugeColor(50, [], 'red')).toBe(CHART_COLORS.red);
    expect(resolveGaugeColor(50, [])).toBe(getGradientFill(50));
  });
});

describe('generateAriaDesc', () => {
  it('값 + 범위 + 백분율 포함', () => {
    const desc = generateAriaDesc(75, 0, 100, '%');
    expect(desc).toContain('75.0%');
    expect(desc).toContain('0%');
    expect(desc).toContain('100%');
    expect(desc).toContain('75%');
  });

  it('범위 밖 값 clamp 후 백분율', () => {
    const desc = generateAriaDesc(150, 0, 100, '%');
    expect(desc).toContain('100%'); // clamp 후 비율
  });
});

// ─── 렌더 테스트 ───
describe('GaugeChart render', () => {
  it('정상 → 배경 호 + 값 호 path 2개', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { GaugeChart } = await import('../GaugeChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(GaugeChart, { title: '회복률', value: 70 }),
    );
    expect(html).toContain('role="img"');
    const pathCount = (html.match(/<path /g) ?? []).length;
    expect(pathCount).toBe(2); // 배경 + 값
    expect(html).toContain(`fill="${BACKGROUND_ARC_FILL}"`);
  });

  it('value==min → 값 호 미표시 (배경만)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { GaugeChart } = await import('../GaugeChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(GaugeChart, { title: '0%', value: 0, min: 0, max: 100 }),
    );
    // 배경 호만
    const pathCount = (html.match(/<path /g) ?? []).length;
    expect(pathCount).toBe(1);
  });

  it('max<=min → 비정상 placeholder', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { GaugeChart } = await import('../GaugeChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(GaugeChart, { title: '비정상', value: 50, min: 100, max: 0 }),
    );
    expect(html).toContain('비정상 범위');
    expect((html.match(/<path /g) ?? []).length).toBe(0);
  });

  it('showValue=false → 중앙 값 텍스트 없음', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { GaugeChart } = await import('../GaugeChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(GaugeChart, {
        title: 'no value',
        value: 50,
        showValue: false,
      }),
    );
    expect(html).not.toContain('>50%<');
  });

  it('zones 적용 → 값 구간색', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { GaugeChart } = await import('../GaugeChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(GaugeChart, {
        title: '구간',
        value: 50,
        zones: [
          { upTo: 30,  color: 'blue' },
          { upTo: 70,  color: 'orange' },
          { upTo: 100, color: 'red' },
        ],
      }),
    );
    // value 50 → upTo 70 구간 → orange
    expect(html).toContain(`fill="${CHART_COLORS.orange}"`);
  });
});
