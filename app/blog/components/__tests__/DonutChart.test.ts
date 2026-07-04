import { describe, it, expect } from 'vitest';
import {
  computeSlice,
  computeSliceLayout,
  computeLabelPosition,
  computeMidVector,
  resolveSliceColor,
  generateAriaDesc,
  SLICE_LABEL_OMIT_THRESHOLD,
  type DonutSlice,
} from '../DonutChart.utils';

describe('computeSliceLayout', () => {
  it('각도 합계 360° (= 2π)', () => {
    const data: DonutSlice[] = [
      { label: 'A', value: 30 },
      { label: 'B', value: 50 },
      { label: 'C', value: 20 },
    ];
    const out = computeSliceLayout(data);
    const last = out[out.length - 1];
    expect(last.endAngle).toBeCloseTo(Math.PI * 2, 5);
    expect(out.reduce((s, c) => s + c.ratio, 0)).toBeCloseTo(1, 5);
  });

  it('value 0 슬라이스 → ratio 0, sweep 0', () => {
    const out = computeSliceLayout([
      { label: 'A', value: 50 },
      { label: 'Empty', value: 0 },
      { label: 'B', value: 50 },
    ]);
    expect(out[1].ratio).toBe(0);
    expect(out[1].startAngle).toBe(out[1].endAngle);
  });

  it('value 음수 → 0으로 sanitize', () => {
    const out = computeSliceLayout([
      { label: 'A', value: -5 },
      { label: 'B', value: 100 },
    ]);
    expect(out[0].value).toBe(0);
    expect(out[1].ratio).toBe(1);
  });

  it('전체 0 → 빈 배열', () => {
    expect(computeSliceLayout([{ label: 'A', value: 0 }, { label: 'B', value: 0 }])).toEqual([]);
    expect(computeSliceLayout([])).toEqual([]);
  });
});

describe('computeSlice (SVG arc path)', () => {
  it('Pie 슬라이스 — M cx cy로 시작', () => {
    const path = computeSlice(0, Math.PI / 2, 100, 100, 80, 0);
    expect(path).toMatch(/^M 100 100/);
    expect(path).toContain('A 80 80');
    expect(path).toMatch(/Z$/);
  });

  it('도넛 슬라이스 — M outerStart로 시작, innerArc 포함', () => {
    const path = computeSlice(0, Math.PI / 2, 100, 100, 80, 40);
    expect(path).not.toMatch(/^M 100 100/);
    expect(path).toContain('A 80 80');
    expect(path).toContain('A 40 40');
  });

  it('100% 단일 슬라이스 (360°) — 두 반원으로 분할', () => {
    const path = computeSlice(0, Math.PI * 2, 100, 100, 80, 40);
    // outer 두 반원 + inner 두 반원 (역방향)
    expect((path.match(/A 80 80/g) ?? []).length).toBe(2);
    expect((path.match(/A 40 40/g) ?? []).length).toBe(2);
  });

  it('sweep 0 또는 음수 → 빈 문자열', () => {
    expect(computeSlice(1, 1, 100, 100, 80, 40)).toBe('');
    expect(computeSlice(2, 1, 100, 100, 80, 40)).toBe('');
  });

  it('large arc flag — 180° 초과 시 1', () => {
    const small = computeSlice(0, Math.PI / 2, 100, 100, 80, 0);
    const large = computeSlice(0, Math.PI * 1.5, 100, 100, 80, 0);
    expect(small).toMatch(/A 80 80 0 0 1/);
    expect(large).toMatch(/A 80 80 0 1 1/);
  });
});

describe('computeMidVector + computeLabelPosition', () => {
  it('mid 12시 방향 (각도 0) → 위쪽', () => {
    const v = computeMidVector(-0.1, 0.1);
    expect(v.dx).toBeCloseTo(0, 5);
    expect(v.dy).toBeCloseTo(-1, 5);
  });

  it('mid 3시 방향 (각도 π/2) → 우측', () => {
    const v = computeMidVector(Math.PI / 2 - 0.01, Math.PI / 2 + 0.01);
    expect(v.dx).toBeCloseTo(1, 2);
    expect(v.dy).toBeCloseTo(0, 2);
  });

  it('우측 슬라이스 → text anchor start', () => {
    const p = computeLabelPosition(Math.PI / 4 - 0.01, Math.PI / 4 + 0.01, 100, 100, 100);
    expect(p.anchor).toBe('start');
  });

  it('좌측 슬라이스 → text anchor end', () => {
    const p = computeLabelPosition(Math.PI * 1.5 - 0.01, Math.PI * 1.5 + 0.01, 100, 100, 100);
    expect(p.anchor).toBe('end');
  });
});

describe('resolveSliceColor (사이클 S Step S-1: hex string 반환)', () => {
  it('slice.color 명시 키워드 → CHART_COLORS hex', () => {
    expect(resolveSliceColor({ label: 'A', value: 50, color: 'darkBlue' }, 0)).toBe('#14213D');
  });
  it('slice.color 명시 hex → 그대로', () => {
    expect(resolveSliceColor({ label: 'A', value: 50, color: '#9ca3af' }, 0)).toBe('#9ca3af');
  });
  it('index 0 → red #E23B3B (category intent, 강조 친화)', () => {
    expect(resolveSliceColor({ label: 'A', value: 50 }, 0)).toBe('#E23B3B');
  });
  it('index 5 → red #E23B3B (5색 순환)', () => {
    expect(resolveSliceColor({ label: 'A', value: 50 }, 5)).toBe('#E23B3B');
  });
});

describe('generateAriaDesc', () => {
  it('빈 데이터 → 빈 차트 메시지', () => {
    expect(generateAriaDesc([])).toBe('데이터가 없는 빈 도넛 차트');
  });
  it('상위 3개 슬라이스 + 비율 포함', () => {
    const data: DonutSlice[] = [
      { label: '40대', value: 30 },
      { label: '30대', value: 50 },
      { label: '50대', value: 15 },
      { label: '20대', value: 5 },
    ];
    const desc = generateAriaDesc(data);
    expect(desc).toContain('4개 슬라이스');
    expect(desc).toContain('30대 50.0%');
    expect(desc).toContain('40대 30.0%');
    expect(desc).toContain('50대 15.0%');
  });
});

describe('SLICE_LABEL_OMIT_THRESHOLD', () => {
  it('5% 임계값으로 정의', () => {
    expect(SLICE_LABEL_OMIT_THRESHOLD).toBe(0.05);
  });
});

// ─── 렌더 테스트: 컴포넌트 동작 ───
describe('DonutChart render', () => {
  it('5 슬라이스 → 5개 path + role/title/desc', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DonutChart } = await import('../DonutChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(DonutChart, {
        title: '연령대 분포',
        data: [
          { label: '20대', value: 10 },
          { label: '30대', value: 35 },
          { label: '40대', value: 30 },
          { label: '50대', value: 15 },
          { label: '60대+', value: 10 },
        ],
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('<title');
    expect(html).toContain('연령대 분포');
    expect((html.match(/<path /g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('highlighted slice → 외부 이동 (transform)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DonutChart } = await import('../DonutChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(DonutChart, {
        title: 'h',
        data: [
          { label: 'A', value: 50, highlighted: true },
          { label: 'B', value: 50 },
        ],
      }),
    );
    expect(html).toContain('translate(');
  });

  it('centerText + centerSubtext → 중앙에 표시', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DonutChart } = await import('../DonutChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(DonutChart, {
        title: '구성',
        data: [{ label: 'A', value: 100 }],
        centerText: '100%',
        centerSubtext: '전체',
      }),
    );
    expect(html).toContain('100%');
    expect(html).toContain('전체');
  });

  it('innerRadius=0 → Pie 차트 (M cx cy → L 패턴)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DonutChart } = await import('../DonutChart');
    const React = await import('react');
    // size=200, viewSize=200+64=264, cx=132, cy=132+12=144
    const html = renderToStaticMarkup(
      React.createElement(DonutChart, {
        title: 'Pie',
        data: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }],
        innerRadius: 0,
        size: 200,
      }),
    );
    // Pie 슬라이스는 M cx cy → L outerStart 패턴 (도넛은 M outerStart로 시작)
    expect(html).toContain('d="M 132 144 L ');
  });

  it('빈 데이터 → placeholder', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DonutChart } = await import('../DonutChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(DonutChart, { title: '빈', data: [] }),
    );
    expect(html).toContain('데이터 없음');
  });

  it('슬라이스 50개 → 색상 순환 처리 (path 50개)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DonutChart } = await import('../DonutChart');
    const React = await import('react');
    const data: DonutSlice[] = Array.from({ length: 50 }, (_, i) => ({
      label: `slice-${i}`,
      value: 2,
    }));
    const html = renderToStaticMarkup(
      React.createElement(DonutChart, { title: '50', data }),
    );
    expect((html.match(/<path /g) ?? []).length).toBe(50);
  });

  it('작은 슬라이스(<5%) → 외부 라벨 생략', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { DonutChart } = await import('../DonutChart');
    const React = await import('react');
    const data: DonutSlice[] = [
      { label: 'BIG_VISIBLE', value: 96 },
      { label: 'TINY_HIDDEN', value: 4 },
    ];
    const html = renderToStaticMarkup(
      // ariaDesc 직접 지정해서 자동 생성 desc에 모든 슬라이스명 들어가는 영향 차단
      React.createElement(DonutChart, { title: 's', data, ariaDesc: 'desc' }),
    );
    // 큰 슬라이스 라벨은 외부 표시됨
    expect(html).toContain('BIG_VISIBLE');
    // 작은 슬라이스 외부 라벨은 생략 (desc에도 없으므로 텍스트 자체 미존재)
    expect(html).not.toContain('TINY_HIDDEN');
  });
});
