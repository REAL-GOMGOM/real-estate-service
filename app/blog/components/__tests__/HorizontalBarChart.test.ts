import { describe, it, expect } from 'vitest';
import {
  computeAutoBaseline,
  computeAutoScale,
  computeBarWidth,
  computeAutoZeroX,
  CHART_CONSTANTS,
} from '../HorizontalBarChart.utils';
import type { BarRow } from '../HorizontalBarChart.utils';

const ZEROX_CONFIG = {
  minLabelLeftPadding:    CHART_CONSTANTS.MIN_LABEL_AREA_LEFT_PADDING,
  groupLabelPadding:      CHART_CONSTANTS.GROUP_LABEL_PADDING,
  valueLabelReserveWidth: CHART_CONSTANTS.VALUE_LABEL_RESERVE_WIDTH,
  koreanCharWidthAt12px:  CHART_CONSTANTS.KOREAN_CHAR_WIDTH_AT_12PX,
};

describe('computeAutoBaseline', () => {
  it('양수 좁은 범위 → dataMin - range × 0.1', () => {
    // [2166, 2300, 2437] → range 271 → 2166 - 27.1 = 2138.9
    expect(computeAutoBaseline([2166, 2300, 2437])).toBeCloseTo(2138.9, 1);
  });

  it('음수 포함 → 0 fallback', () => {
    expect(computeAutoBaseline([-5, 10, 20])).toBe(0);
  });

  it('모두 음수 → 0 fallback (양방향 차트)', () => {
    expect(computeAutoBaseline([-10, -5, -2])).toBe(0);
  });

  it('단일값 → 그 값 자체', () => {
    expect(computeAutoBaseline([100])).toBe(100);
  });

  it('모두 동일값 → 그 값 자체', () => {
    expect(computeAutoBaseline([100, 100, 100])).toBe(100);
  });

  it('빈 배열 → 0', () => {
    expect(computeAutoBaseline([])).toBe(0);
  });
});

describe('computeAutoScale', () => {
  it('baseline 적용 후 가장 큰 막대가 availableWidth에 들어감', () => {
    const values = [2166, 2300, 2437];
    const baseline = 2138.9;
    const availableWidth = 400;
    const scale = computeAutoScale(values, baseline, availableWidth);
    const maxDelta = Math.max(...values.map((v) => Math.abs(v - baseline)));
    expect(maxDelta * scale).toBeCloseTo(availableWidth, 1);
    expect(scale).toBeGreaterThan(0);
  });

  it('maxValue 지정 시 maxValue가 availableWidth 채움', () => {
    const scale = computeAutoScale([10, 20, 75.9], 0, 400, 35);
    expect(35 * scale).toBeCloseTo(400, 1);
  });

  it('availableWidth 0 → scale 1 (안전 fallback)', () => {
    expect(computeAutoScale([10, 20], 0, 0)).toBe(1);
  });

  it('모든 값이 baseline과 같음 → scale 1', () => {
    expect(computeAutoScale([100, 100], 100, 400)).toBe(1);
  });
});

describe('computeBarWidth', () => {
  it('정상값 → 클립 X', () => {
    expect(computeBarWidth(20, 0, 10)).toEqual({ width: 200, isClipped: false });
  });

  it('maxValue 초과 → 클립', () => {
    expect(computeBarWidth(75.9, 0, 10, 35)).toEqual({ width: 350, isClipped: true });
  });

  it('baseline 적용 → 초과분만', () => {
    const r = computeBarWidth(2437, 2138.9, 1);
    expect(r.width).toBeCloseTo(298.1, 1);
    expect(r.isClipped).toBe(false);
  });

  it('음수값 → 절대값 폭, baseline=0', () => {
    expect(computeBarWidth(-5, 0, 10)).toEqual({ width: 50, isClipped: false });
  });

  it('음수값 + maxValue 초과 → 클립', () => {
    // value=-15, baseline=0, maxValue=10 → maxDelta=10, absDelta=15 → 클립, width=10*10
    expect(computeBarWidth(-15, 0, 10, 10)).toEqual({ width: 100, isClipped: true });
  });
});

describe('computeAutoZeroX', () => {
  const shortLabelData: BarRow[] = [
    { label: '서울', value: 24 },
    { label: '경기', value: 23 },
  ];

  it('라벨 짧음 + 사용자 zeroX 충분 → 그대로', () => {
    const z = computeAutoZeroX(shortLabelData, 10, 0, 200, ZEROX_CONFIG);
    expect(z).toBe(200);
  });

  it('라벨 길음 → zeroX 확장', () => {
    const longLabelData: BarRow[] = [
      { label: '잠실주공5단지아파트', value: 24 }, // .length = 10
      { label: '서초구', value: 17 },
    ];
    const z = computeAutoZeroX(longLabelData, 10, 0, 100, ZEROX_CONFIG);
    // 5 + 10*12 + 10 = 135 → userZeroX(100) 보다 큼
    expect(z).toBeGreaterThan(100);
    expect(z).toBeCloseTo(135, 0);
  });

  it('음수 데이터 + 긴 라벨 → 음수 막대 영역 + 라벨 모두 고려', () => {
    const data: BarRow[] = [
      { label: '평택시 (경기)', value: -6.9 }, // .length = 8 (공백·괄호 포함)
      { label: '강남구 (서울)', value: 21 },
    ];
    const z = computeAutoZeroX(data, 10, 0, 100, ZEROX_CONFIG);
    // 5 + 8*12 + 10 + 6.9*10 + 35 = 215 → 100 보다 큼
    expect(z).toBeGreaterThan(100);
    expect(z).toBeCloseTo(215, 0);
  });

  it('빈 데이터 → 사용자 zeroX 그대로', () => {
    expect(computeAutoZeroX([], 10, 0, 200, ZEROX_CONFIG)).toBe(200);
  });
});

// ─── 회귀 테스트: 발행 글 4곳의 차트 default 분기 동작 보장 ───
//
// 모두 baseline·autoBaseline·maxValue·autoScale 미지정 (기존 props만).
// 사이클 K 변경 후에도 baseline=0, scale 사용자 지정/default 그대로 동작해야 함.
// 따라서 computeBarWidth(value, 0, scale)이 기존 |value| × scale과 동일해야 함.

describe('regression: kb-report-2026-polarization-where-to-buy chart 1', () => {
  // 음수 포함 — 기존 동작 유지 (baseline=0)
  const values = [24.0, 23.0, 21.0, -3.0, -4.0, -5.5, -6.5, -6.9];
  const scale = 10; // default

  it('각 막대 폭이 기존 |value| × scale 과 동일', () => {
    for (const v of values) {
      const r = computeBarWidth(v, 0, scale);
      expect(r.width).toBeCloseTo(Math.abs(v) * scale, 5);
      expect(r.isClipped).toBe(false);
    }
  });
});

describe('regression: kb-report-2026-monthly-rent-era chart 1', () => {
  // 양수만, baseline=0 (기존)
  const values = [0, 9.6, 14.0, 17.6, 22.7, 28.3];
  const scale = 10;

  it('각 막대 폭이 |value| × scale', () => {
    for (const v of values) {
      const r = computeBarWidth(v, 0, scale);
      expect(r.width).toBeCloseTo(v * scale, 5);
    }
  });
});

describe('regression: kb-report-2026-tax-reform-h2 chart 1', () => {
  const values = [33, 28, 19, 14];
  const scale = 10;

  it('정수값 막대 폭 동일', () => {
    for (const v of values) {
      expect(computeBarWidth(v, 0, scale).width).toBe(v * scale);
    }
  });
});

describe('regression: yongsan-hoban-summit-105b-checklist chart 1', () => {
  const values = [2.07, 6.06, 21.05, 17.08];
  const scale = 10;

  it('소수 막대 폭 보존', () => {
    for (const v of values) {
      expect(computeBarWidth(v, 0, scale).width).toBeCloseTo(v * scale, 5);
    }
  });
});

// ─── SVG 렌더 회귀: default 분기 (신규 props 미사용) ───
describe('regression: HorizontalBarChart SVG render — default branch', () => {
  it('polarization chart 1 (15행, 음수 포함) — clip 마커·캡션 0개, height 동일', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { HorizontalBarChart } = await import('../HorizontalBarChart');
    const React = await import('react');
    const data = [
      { label: '송파구 (서울)', value: 24.0, color: 'red' as const },
      { label: '성동구 (서울)', value: 23.0, color: 'red' as const },
      { label: '강남구 (서울)', value: 21.0, color: 'red' as const },
      { label: '광진구 (서울)', value: 20.7, color: 'red' as const },
      { label: '과천시 (경기)', value: 20.7, color: 'orange' as const },
      { label: '강동구 (서울)', value: 17.9, color: 'red' as const },
      { label: '양천구 (서울)', value: 17.7, color: 'red' as const },
      { label: '서초구 (서울)', value: 17.6, color: 'red' as const },
      { label: '마포구 (서울)', value: 17.1, color: 'red' as const },
      { label: '성남시 (경기)', value: 16.3, color: 'orange' as const },
      { label: '파주시 (경기)', value: -3.0, color: 'blue' as const },
      { label: '안성시 (경기)', value: -4.0, color: 'blue' as const },
      { label: '동두천시 (경기)', value: -5.5, color: 'blue' as const },
      { label: '이천시 (경기)', value: -6.5, color: 'blue' as const },
      { label: '평택시 (경기)', value: -6.9, color: 'darkBlue' as const },
    ];
    const html = renderToStaticMarkup(
      React.createElement(HorizontalBarChart, {
        title: '2025년 수도권 아파트 매매가격 변동률 — 상위 10 / 하위 5',
        data,
        dividerAfter: 9,
        dividerText: '↕ 같은 수도권 안에서 30%p 격차 ↕',
      }),
    );

    // 1. 클립 마커 (▶/◀) 없음 — 기존 코드와 동일
    expect(html).not.toContain('▶');
    expect(html).not.toContain('◀');
    // 2. 잘림 캡션 없음
    expect(html).not.toContain('차트 영역을 벗어난 값');
    // 3. axisLabel '0%' 그대로
    expect(html).toContain('>0%</text>');
    // 4. height 계산: TOP_PADDING + 15*ROW_PITCH + BOTTOM_PADDING + DIVIDER_GAP*2
    //   = 50 + 360 + 40 + 24 = 474
    expect(html).toContain('viewBox="0 0 640 474"');
    // 5. rect 요소 개수 = 데이터 행 수 (15)
    expect((html.match(/<rect /g) ?? []).length).toBe(15);
    // 6. 양수 값 라벨 '+' 접두사 (baseline=0이므로 유지)
    expect(html).toContain('+24.0%');
    expect(html).toContain('-6.9%');
  });

  it('monthly-rent-era chart 1 (양수만) — value 0 라벨 처리 보존', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { HorizontalBarChart } = await import('../HorizontalBarChart');
    const React = await import('react');
    const data = [
      { label: '2021 (40.0%)', value: 0 },
      { label: '2022 (49.6%)', value: 9.6 },
      { label: '2023 (54.0%)', value: 14.0 },
      { label: '2024 (57.6%)', value: 17.6 },
      { label: '2025 (62.7%)', value: 22.7 },
      { label: '2026.1-2 (68.3%)', value: 28.3 },
    ];
    const html = renderToStaticMarkup(
      React.createElement(HorizontalBarChart, {
        title: '전월세 거래 중 월세 비중 - 2021년 대비 누적 증가폭',
        colorMode: 'gradient',
        data,
        dividerAfter: 4,
        dividerText: '↑ 4년 만에 28%p 점프',
      }),
    );

    expect(html).not.toContain('▶');
    expect(html).not.toContain('차트 영역을 벗어난 값');
    expect(html).toContain('>0%</text>');           // axis label
    expect(html).toContain('+0.0%');                // first row, value=0, +' prefix preserved
    expect(html).toContain('+28.3%');               // last row
    expect((html.match(/<rect /g) ?? []).length).toBe(6);
  });
});
