import { describe, it, expect } from 'vitest';
import {
  computeAxisDomain,
  collectXValues,
  detectXAxisType,
  mapPointToCoord,
  buildLinePath,
  buildAreaPath,
  resolveSeriesColor,
  computeYTicks,
  isPointClipped,
  generateAriaDesc,
  type LineSeries,
} from '../LineChart.utils';

const PLOT = { x: 60, y: 60, width: 540, height: 240 };

describe('computeAxisDomain', () => {
  it('default — min=0, max=dataMax', () => {
    const series: LineSeries[] = [{ name: 'A', data: [{ x: '1', y: 10 }, { x: '2', y: 20 }] }];
    expect(computeAxisDomain(series)).toEqual({ min: 0, max: 20 });
  });

  it('autoBaseline — dataMin - range × 0.1', () => {
    const series: LineSeries[] = [{ name: 'A', data: [{ x: 1, y: 100 }, { x: 2, y: 110 }] }];
    const d = computeAxisDomain(series, undefined, true);
    expect(d.min).toBeCloseTo(99, 1); // 100 - 10 × 0.1 = 99
    expect(d.max).toBe(110);
  });

  it('baseline 명시 + maxValue', () => {
    const series: LineSeries[] = [{ name: 'A', data: [{ x: 1, y: 5 }, { x: 2, y: 80 }] }];
    expect(computeAxisDomain(series, 0, false, 50)).toEqual({ min: 0, max: 50 });
  });

  it('빈 데이터 → safe placeholder', () => {
    expect(computeAxisDomain([])).toEqual({ min: 0, max: 1 });
    expect(computeAxisDomain([{ name: 'A', data: [] }])).toEqual({ min: 0, max: 1 });
  });

  it('max <= min 보호', () => {
    const series: LineSeries[] = [{ name: 'A', data: [{ x: 1, y: 5 }] }];
    const d = computeAxisDomain(series, 10);
    expect(d.max).toBeGreaterThan(d.min);
  });
});

describe('collectXValues + detectXAxisType', () => {
  it('첫 등장 순서 유지', () => {
    const series: LineSeries[] = [
      { name: 'A', data: [{ x: 'Q1', y: 1 }, { x: 'Q2', y: 2 }] },
      { name: 'B', data: [{ x: 'Q2', y: 3 }, { x: 'Q3', y: 4 }] },
    ];
    expect(collectXValues(series)).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('숫자 x → numeric, 문자 x → category', () => {
    expect(detectXAxisType([{ name: 'A', data: [{ x: 2024, y: 1 }] }])).toBe('numeric');
    expect(detectXAxisType([{ name: 'A', data: [{ x: '2024', y: 1 }] }])).toBe('category');
    expect(detectXAxisType([])).toBe('category'); // 빈 데이터 안전 default
  });
});

describe('mapPointToCoord', () => {
  it('category 축, 첫 점은 plot.x, 마지막 점은 plot.x+width', () => {
    const xs = ['Q1', 'Q2', 'Q3'];
    const r1 = mapPointToCoord('Q1', 0, { min: 0, max: 100 }, PLOT, 'category', xs);
    const r3 = mapPointToCoord('Q3', 100, { min: 0, max: 100 }, PLOT, 'category', xs);
    expect(r1.cx).toBe(60);
    expect(r3.cx).toBe(60 + 540);
    // y=0 → plot 바닥, y=100 → plot 상단
    expect(r1.cy).toBe(60 + 240);
    expect(r3.cy).toBe(60);
  });

  it('단일 x 값 → 가운데 배치', () => {
    const r = mapPointToCoord('only', 50, { min: 0, max: 100 }, PLOT, 'category', ['only']);
    expect(r.cx).toBe(60 + 270);
  });

  it('numeric 축 — 선형 매핑', () => {
    const r = mapPointToCoord(2025, 50, { min: 0, max: 100 }, PLOT, 'numeric', [2020, 2030], 2020, 2030);
    expect(r.cx).toBe(60 + 270); // mid
  });

  it('y가 baseline일 때 plot 바닥', () => {
    const r = mapPointToCoord('a', 10, { min: 10, max: 20 }, PLOT, 'category', ['a']);
    expect(r.cy).toBe(60 + 240);
  });
});

describe('buildLinePath / buildAreaPath', () => {
  it('단일 점 — M만 있는 path', () => {
    expect(buildLinePath([{ cx: 10, cy: 20 }])).toBe('M 10 20');
  });

  it('두 점 — M + L', () => {
    expect(buildLinePath([{ cx: 0, cy: 0 }, { cx: 10, cy: 10 }])).toBe('M 0 0 L 10 10');
  });

  it('빈 배열 → 빈 문자열', () => {
    expect(buildLinePath([])).toBe('');
    expect(buildAreaPath([], 0)).toBe('');
  });

  it('area path — 시작·끝점이 baseline로 닫힘', () => {
    const p = buildAreaPath([{ cx: 0, cy: 50 }, { cx: 10, cy: 30 }], 100);
    expect(p).toBe('M 0 100 L 0 50 L 10 30 L 10 100 Z');
  });
});

describe('resolveSeriesColor (사이클 S Step S-1: hex string 반환)', () => {
  it('series 1개 → blue #2563eb (단일 시리즈 강조색, 사이클 N 결정 유지)', () => {
    expect(resolveSeriesColor({ name: 'A', data: [] }, 0, 1)).toBe('#2563eb');
  });
  it('series 2개 → [gray #6b7280, red #dc2626]', () => {
    expect(resolveSeriesColor({ name: 'A', data: [] }, 0, 2)).toBe('#6b7280');
    expect(resolveSeriesColor({ name: 'B', data: [] }, 1, 2)).toBe('#dc2626');
  });
  it('series.color 명시 키워드 → CHART_COLORS hex', () => {
    expect(resolveSeriesColor({ name: 'A', color: 'darkBlue', data: [] }, 0, 1)).toBe('#1d4ed8');
  });
  it('series.color 명시 hex → 그대로 (단일 시리즈에서도 blue fallback 미발동)', () => {
    expect(resolveSeriesColor({ name: 'A', color: '#9ca3af', data: [] }, 0, 1)).toBe('#9ca3af');
  });
});

describe('computeYTicks', () => {
  it('count=5 → 5개 균등 분할', () => {
    expect(computeYTicks({ min: 0, max: 100 }, 5)).toEqual([0, 25, 50, 75, 100]);
  });
  it('count=2 → min, max', () => {
    expect(computeYTicks({ min: 10, max: 20 }, 2)).toEqual([10, 20]);
  });
});

describe('isPointClipped', () => {
  it('정상값 → not clipped', () => {
    expect(isPointClipped(50, { min: 0, max: 100 })).toEqual({ clipped: false, direction: null });
  });
  it('maxValue 초과 → up', () => {
    expect(isPointClipped(150, { min: 0, max: 100 }, 100)).toEqual({ clipped: true, direction: 'up' });
  });
  it('domain.min 미만 → down', () => {
    expect(isPointClipped(-5, { min: 0, max: 100 })).toEqual({ clipped: true, direction: 'down' });
  });
});

describe('generateAriaDesc', () => {
  it('빈 시리즈 → 빈 차트 메시지', () => {
    expect(generateAriaDesc([], '%')).toBe('데이터가 없는 빈 차트');
  });
  it('데이터 없는 시리즈 → 시리즈 수만 보고', () => {
    expect(generateAriaDesc([{ name: 'A', data: [] }], '%')).toContain('데이터 없음');
  });
  it('시리즈 + 데이터 → 시리즈명·범위 포함', () => {
    const series: LineSeries[] = [
      { name: '강남', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }] },
      { name: '서초', data: [{ x: 1, y: 15 }, { x: 2, y: 25 }] },
    ];
    const desc = generateAriaDesc(series, '%');
    expect(desc).toContain('2개 시리즈');
    expect(desc).toContain('강남, 서초');
    expect(desc).toContain('10.0%');
    expect(desc).toContain('25.0%');
  });
});

// ─── 렌더 테스트: 컴포넌트 동작 ───
describe('LineChart render', () => {
  it('빈 데이터 → placeholder + role/title/desc', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { LineChart } = await import('../LineChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(LineChart, { title: '빈 차트', series: [] }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('<title');
    expect(html).toContain('빈 차트');
    expect(html).toContain('<desc');
    expect(html).toContain('데이터 없음');
  });

  it('단일 시리즈 + filled + dashed → path + fillOpacity + strokeDasharray', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { LineChart } = await import('../LineChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(LineChart, {
        title: '추세',
        series: [{
          name: '강남',
          data: [{ x: 'Q1', y: 10 }, { x: 'Q2', y: 15 }, { x: 'Q3', y: 20 }],
          filled: true,
          dashed: true,
        }],
      }),
    );
    // filled area path 존재
    expect(html).toMatch(/fill-opacity="0.15"/);
    // dashed stroke
    expect(html).toContain('stroke-dasharray="6 4"');
    // 점 3개
    expect((html.match(/<circle /g) ?? []).length).toBe(3);
  });

  it('다중 시리즈 → legend 표시 (default)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { LineChart } = await import('../LineChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(LineChart, {
        title: '비교',
        series: [
          { name: '강남', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }] },
          { name: '서초', data: [{ x: 1, y: 15 }, { x: 2, y: 25 }] },
        ],
      }),
    );
    expect(html).toContain('강남');
    expect(html).toContain('서초');
  });

  it('showGrid=false, showLegend=false, showDots=false → 그리드/legend/점 없음', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { LineChart } = await import('../LineChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(LineChart, {
        title: 'minimal',
        series: [{ name: 'A', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }] }],
        showGrid: false,
        showLegend: false,
        showDots: false,
      }),
    );
    // 그리드 점선 없음 (3 3 패턴)
    expect(html).not.toContain('stroke-dasharray="3 3"');
    // 점 없음
    expect((html.match(/<circle /g) ?? []).length).toBe(0);
  });

  it('maxValue 초과 점 → clipped marker (polygon) 표시', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { LineChart } = await import('../LineChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(LineChart, {
        title: '컷오프',
        series: [{ name: 'A', data: [{ x: 1, y: 10 }, { x: 2, y: 200 }] }],
        maxValue: 50,
      }),
    );
    expect(html).toContain('<polygon');
  });

  it('ariaDesc 명시 → 그대로 사용', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { LineChart } = await import('../LineChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(LineChart, {
        title: 'A',
        series: [{ name: 'X', data: [{ x: 1, y: 1 }] }],
        ariaDesc: '커스텀 설명',
      }),
    );
    expect(html).toContain('커스텀 설명');
  });
});
