import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { HorizontalBarChart } from '../HorizontalBarChart';
import {
  CHART_CONSTANTS,
  computeRightLabelWidth,
} from '../HorizontalBarChart.utils';

/**
 * 사이클 R — HorizontalBarChart 우측 라벨 잘림 자동 fix 검증.
 *
 * computeRightLabelWidth: 모든 row 값 라벨(`value.toFixed(1)+unit`) 너비 추정 중
 * 최대값 + LABEL_RIGHT_PADDING + VIEWBOX_RIGHT_BUFFER 반환.
 *
 * 헬퍼는 estimateTextWidth 가중치를 그대로 사용 — 한글 13px/char, 영문/숫자/기호 7px/char.
 */

const PADDING_TOTAL =
  CHART_CONSTANTS.LABEL_RIGHT_PADDING + CHART_CONSTANTS.VIEWBOX_RIGHT_BUFFER; // 8 + 4 = 12

describe('computeRightLabelWidth (사이클 R)', () => {
  it('가장 긴 라벨 + padding 반환 (모두 영문/숫자)', () => {
    const data = [
      { label: 'A', value: 10 },     // "10.0%" → 5 × 7 = 35
      { label: 'B', value: 4618.0 }, // "4618.0%" → 7 × 7 = 49
    ];
    expect(computeRightLabelWidth(data, '%')).toBe(49 + PADDING_TOTAL); // 61
  });

  it('한글 단위 포함 → 한글 가중치(13px) 반영', () => {
    const data = [{ label: 'A', value: 4618.0 }];
    // "4618.0조" = 6 라틴(7) + 1 한글(13) = 42 + 13 = 55
    expect(computeRightLabelWidth(data, '조')).toBe(55 + PADDING_TOTAL); // 67
  });

  it('빈 데이터 → 0', () => {
    expect(computeRightLabelWidth([], '%')).toBe(0);
  });

  it('음수 값 → toFixed가 부호 포함 → 부호 너비 반영', () => {
    const data = [
      { label: 'A', value: -6.9 }, // "-6.9%" → 5 × 7 = 35
      { label: 'B', value: 10.0 }, // "10.0%" → 5 × 7 = 35
    ];
    expect(computeRightLabelWidth(data, '%')).toBe(35 + PADDING_TOTAL); // 47
  });

  it('unit 빈 문자열 → 숫자 라벨만 추정', () => {
    const data = [{ label: 'A', value: 2437.0 }]; // "2437.0" = 6 × 7 = 42
    expect(computeRightLabelWidth(data, '')).toBe(42 + PADDING_TOTAL); // 54
  });
});

describe('HorizontalBarChart 우측 라벨 잘림 fix 통합', () => {
  it('긴 한글 단위 라벨 차트 렌더 → svg 정상 출력', () => {
    const html = renderToStaticMarkup(
      createElement(HorizontalBarChart, {
        title: 'M2 광의통화 추이',
        unit: '조',
        data: [
          { label: '2020', value: 3000.0, color: 'gray' },
          { label: '2026', value: 4618.0, color: 'red' },
        ],
      }),
    );
    expect(html).toContain('<svg');
    // 값 라벨 자체가 그대로 SVG에 출력되는지 (잘리지 않는다는 신호)
    expect(html).toContain('4618.0조');
    expect(html).toContain('3000.0조');
  });
});
