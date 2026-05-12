import { describe, it, expect } from 'vitest';
import {
  sanitizeSegmentValue,
  normalizeBars,
  resolveSegmentColor,
  computeChartMax,
  buildLegendEntries,
  generateAriaDesc,
  formatSegmentLabel,
  type StackedBar,
  type StackedSegment,
} from '../StackedBarChart.utils';

describe('sanitizeSegmentValue', () => {
  it('양수 → 그대로', () => {
    expect(sanitizeSegmentValue(10)).toBe(10);
    expect(sanitizeSegmentValue(0.5)).toBe(0.5);
  });
  it('음수 → 0', () => {
    expect(sanitizeSegmentValue(-5)).toBe(0);
  });
  it('0 → 0', () => {
    expect(sanitizeSegmentValue(0)).toBe(0);
  });
  it('NaN·Infinity → 0', () => {
    expect(sanitizeSegmentValue(NaN)).toBe(0);
    expect(sanitizeSegmentValue(Infinity)).toBe(0);
  });
});

describe('resolveSegmentColor', () => {
  it('segment.color 명시 → 명시값 우선', () => {
    expect(resolveSegmentColor({ label: 'A', value: 10, color: 'darkBlue' }, 0)).toBe('darkBlue');
  });
  it('index 0 → red (category intent)', () => {
    expect(resolveSegmentColor({ label: 'A', value: 10 }, 0)).toBe('red');
  });
  it('index 1 → blue', () => {
    expect(resolveSegmentColor({ label: 'A', value: 10 }, 1)).toBe('blue');
  });
  it('index 2 → orange', () => {
    expect(resolveSegmentColor({ label: 'A', value: 10 }, 2)).toBe('orange');
  });
  it('index 3 → darkBlue', () => {
    expect(resolveSegmentColor({ label: 'A', value: 10 }, 3)).toBe('darkBlue');
  });
  it('index 5 → red (5색 순환)', () => {
    expect(resolveSegmentColor({ label: 'A', value: 10 }, 5)).toBe('red');
  });
});

describe('normalizeBars', () => {
  const sample: StackedBar[] = [
    { label: 'bar1', segments: [
      { label: 'A', value: 30 },
      { label: 'B', value: 20 },
      { label: 'C', value: 50 },
    ] },
    { label: 'bar2', segments: [
      { label: 'A', value: 10 },
      { label: 'B', value: 30 },
      { label: 'C', value: 10 },
    ] },
  ];

  it('percentMode=false → raw value 유지', () => {
    const out = normalizeBars(sample, false);
    expect(out[0].total).toBe(100);
    expect(out[1].total).toBe(50);
    expect(out[0].segments[0].displayValue).toBe(30);
    expect(out[1].segments[0].displayValue).toBe(10);
  });

  it('percentMode=true → 각 bar 합 100으로 정규화', () => {
    const out = normalizeBars(sample, true);
    expect(out[0].total).toBe(100);
    expect(out[1].total).toBe(100);
    expect(out[1].segments[0].displayValue).toBeCloseTo(20, 5); // 10 / 50 × 100
    expect(out[1].segments[1].displayValue).toBeCloseTo(60, 5);
    expect(out[1].segments[2].displayValue).toBeCloseTo(20, 5);
  });

  it('cumOffset 누적 정확 — segment[i].cumOffset = sum(prev displayValues)', () => {
    const out = normalizeBars(sample, false);
    const segs = out[0].segments;
    expect(segs[0].cumOffset).toBe(0);
    expect(segs[1].cumOffset).toBe(30);
    expect(segs[2].cumOffset).toBe(50);
  });

  it('음수 segment value → 0 처리 (sanitize)', () => {
    const bars: StackedBar[] = [
      { label: 'b', segments: [
        { label: 'A', value: 30 },
        { label: 'B', value: -10 },
        { label: 'C', value: 20 },
      ] },
    ];
    const out = normalizeBars(bars, false);
    expect(out[0].segments[1].rawValue).toBe(0);
    expect(out[0].segments[1].displayValue).toBe(0);
    expect(out[0].segments[2].cumOffset).toBe(30); // B 0이므로 C는 30부터
    expect(out[0].rawTotal).toBe(50);
  });

  it('합계 0인 bar → percentMode에서 무영향 (그대로 0)', () => {
    const bars: StackedBar[] = [
      { label: 'empty', segments: [
        { label: 'A', value: 0 },
        { label: 'B', value: 0 },
      ] },
    ];
    const out = normalizeBars(bars, true);
    expect(out[0].total).toBe(0);
    expect(out[0].rawTotal).toBe(0);
    expect(out[0].segments[0].displayValue).toBe(0);
  });

  it('빈 segments 배열', () => {
    const out = normalizeBars([{ label: 'b', segments: [] }], false);
    expect(out[0].segments).toEqual([]);
    expect(out[0].total).toBe(0);
  });
});

describe('computeChartMax', () => {
  it('정규화 후 각 bar total 중 max', () => {
    const bars: StackedBar[] = [
      { label: 'a', segments: [{ label: 'x', value: 30 }, { label: 'y', value: 70 }] },
      { label: 'b', segments: [{ label: 'x', value: 50 }, { label: 'y', value: 30 }] },
    ];
    const out = normalizeBars(bars, false);
    expect(computeChartMax(out)).toBe(100);
  });
  it('percentMode → 100', () => {
    const bars: StackedBar[] = [
      { label: 'a', segments: [{ label: 'x', value: 100 }] },
    ];
    const out = normalizeBars(bars, true);
    expect(computeChartMax(out)).toBe(100);
  });
  it('빈 배열 → 0', () => {
    expect(computeChartMax([])).toBe(0);
  });
});

describe('buildLegendEntries', () => {
  it('bars[0] segments 순서로 legend', () => {
    const bars: StackedBar[] = [
      { label: 'b1', segments: [{ label: 'X', value: 1 }, { label: 'Y', value: 2 }] },
      { label: 'b2', segments: [{ label: 'X', value: 3 }, { label: 'Y', value: 4 }] },
    ];
    expect(buildLegendEntries(bars)).toEqual([
      { label: 'X', index: 0 },
      { label: 'Y', index: 1 },
    ]);
  });

  it('bars 별 segment 수가 다른 경우 → 합집합 (먼저 등장 우선)', () => {
    const bars: StackedBar[] = [
      { label: 'b1', segments: [{ label: 'X', value: 1 }] },
      { label: 'b2', segments: [{ label: 'X', value: 3 }, { label: 'Z', value: 4 }] },
    ];
    expect(buildLegendEntries(bars)).toEqual([
      { label: 'X', index: 0 },
      { label: 'Z', index: 1 },
    ]);
  });

  it('빈 bars → 빈 배열', () => {
    expect(buildLegendEntries([])).toEqual([]);
  });
});

describe('generateAriaDesc', () => {
  it('빈 bars → 빈 차트 메시지', () => {
    expect(generateAriaDesc([])).toBe('데이터가 없는 빈 누적 막대 차트');
  });
  it('bar 수 + segment 수 + 샘플 포함', () => {
    const bars: StackedBar[] = [
      { label: '서울', segments: [{ label: '아파트', value: 60 }, { label: '빌라', value: 40 }] },
      { label: '경기', segments: [{ label: '아파트', value: 70 }, { label: '빌라', value: 30 }] },
    ];
    const desc = generateAriaDesc(bars);
    expect(desc).toContain('2개 막대');
    expect(desc).toContain('2개 세그먼트');
    expect(desc).toContain('서울');
    expect(desc).toContain('아파트 60');
  });
});

describe('formatSegmentLabel (사이클 N Step 5 정책)', () => {
  it('value 0 → 빈 문자열 (정보 손실 0)', () => {
    expect(formatSegmentLabel(0, '%', true)).toBe('');
    expect(formatSegmentLabel(0, '건', false)).toBe('');
  });

  it('percentMode=true → 항상 소수점 1자리', () => {
    expect(formatSegmentLabel(0.3, '%', true)).toBe('0.3%');
    expect(formatSegmentLabel(33.33, '%', true)).toBe('33.3%');
    expect(formatSegmentLabel(100, '%', true)).toBe('100.0%');
  });

  it('percentMode=false + 정수 → 정수 그대로', () => {
    expect(formatSegmentLabel(30, '', false)).toBe('30');
    expect(formatSegmentLabel(42, '건', false)).toBe('42건');
  });

  it('percentMode=false + 소수 → 소수점 1자리', () => {
    expect(formatSegmentLabel(0.7, '%', false)).toBe('0.7%');
    expect(formatSegmentLabel(12.34, '', false)).toBe('12.3');
  });

  it('unit 미지정 → 숫자만', () => {
    expect(formatSegmentLabel(30, undefined, false)).toBe('30');
    expect(formatSegmentLabel(33.33, undefined, true)).toBe('33.3');
  });
});

// ─── 렌더 테스트 ───
describe('StackedBarChart render', () => {
  it('기본 렌더 — bars 3 × segments 4, role/title/desc', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StackedBarChart } = await import('../StackedBarChart');
    const React = await import('react');
    const bars: StackedBar[] = [
      { label: 'Q1', segments: [
        { label: 'A', value: 10 }, { label: 'B', value: 20 },
        { label: 'C', value: 30 }, { label: 'D', value: 40 },
      ] },
      { label: 'Q2', segments: [
        { label: 'A', value: 15 }, { label: 'B', value: 25 },
        { label: 'C', value: 35 }, { label: 'D', value: 25 },
      ] },
      { label: 'Q3', segments: [
        { label: 'A', value: 20 }, { label: 'B', value: 30 },
        { label: 'C', value: 25 }, { label: 'D', value: 25 },
      ] },
    ];
    const html = renderToStaticMarkup(
      React.createElement(StackedBarChart, {
        title: 'test',
        bars,
        ariaDesc: 'desc',
        showLegend: false, // legend rect 폴루션 차단
      }),
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('<title');
    expect(html).toContain('<desc');
    // 3 bars × 4 segments = 12 rect (모두 양수, legend 비활성화로 dot rect 없음)
    expect((html.match(/<rect /g) ?? []).length).toBe(12);
  });

  it('percentMode=true → 모든 bar 같은 높이 (정규화 100%)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StackedBarChart } = await import('../StackedBarChart');
    const React = await import('react');
    const bars: StackedBar[] = [
      { label: '낮음', segments: [{ label: 'A', value: 10 }, { label: 'B', value: 5 }] },
      { label: '높음', segments: [{ label: 'A', value: 200 }, { label: 'B', value: 100 }] },
    ];
    const html = renderToStaticMarkup(
      React.createElement(StackedBarChart, {
        title: 'pct', bars, percentMode: true, ariaDesc: 'd',
        showLegend: false, // legend rect height 폴루션 차단
      }),
    );
    // 각 bar의 segment A는 모두 같은 ratio (10/15 vs 200/300 = 2/3 동일)
    // segment A의 height 추출 — rect height 속성 (segment rect만)
    const heights = (html.match(/height="(\d+\.?\d*)"/g) ?? []).map((m) =>
      parseFloat(m.replace(/[^\d.]/g, '')),
    );
    // heights 순서 = bar1.segA, bar1.segB, bar2.segA, bar2.segB
    expect(heights[0]).toBeCloseTo(heights[2], 1);
    expect(heights[1]).toBeCloseTo(heights[3], 1);
  });

  it('showSegmentLabels=true → 세그먼트 안에 value 텍스트', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StackedBarChart } = await import('../StackedBarChart');
    const React = await import('react');
    const bars: StackedBar[] = [
      { label: 'b', segments: [
        { label: 'A', value: 60 },
        { label: 'B', value: 40 },
      ] },
    ];
    const html = renderToStaticMarkup(
      React.createElement(StackedBarChart, {
        title: 't', bars, showSegmentLabels: true, ariaDesc: 'd',
      }),
    );
    expect(html).toContain('>60<');
    expect(html).toContain('>40<');
  });

  it('showLegend=true → segment label 표시', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StackedBarChart } = await import('../StackedBarChart');
    const React = await import('react');
    const bars: StackedBar[] = [
      { label: 'b', segments: [{ label: '서울', value: 60 }, { label: '경기', value: 40 }] },
    ];
    const html = renderToStaticMarkup(
      React.createElement(StackedBarChart, {
        title: 't', bars, showLegend: true, ariaDesc: 'd',
      }),
    );
    expect(html).toContain('서울');
    expect(html).toContain('경기');
  });

  it('ariaDesc 명시 → 그대로 사용', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StackedBarChart } = await import('../StackedBarChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(StackedBarChart, {
        bars: [{ label: 'b', segments: [{ label: 'A', value: 10 }] }],
        ariaDesc: '커스텀 desc',
      }),
    );
    expect(html).toContain('커스텀 desc');
  });

  it('빈 bars → placeholder', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { StackedBarChart } = await import('../StackedBarChart');
    const React = await import('react');
    const html = renderToStaticMarkup(
      React.createElement(StackedBarChart, { title: '빈', bars: [], ariaDesc: 'd' }),
    );
    expect(html).toContain('데이터 없음');
  });
});
