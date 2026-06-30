import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { DemographicShiftBars } from '../DemographicShiftBars';

/**
 * Phase 8-3 — DemographicShiftBars 값 정규화 검증.
 *
 * 핵심 회귀 0 보장:
 * - 0~100 비율 데이터 (KB-Report 매수자 거주지 등 기존 사용 케이스)는
 *   effectiveScale === SCALE(2.78)로 기존 폭과 정확히 일치
 * - 큰 절댓값(200+)일 때만 자동 축소 발동, MAX_BAR_WIDTH(278) 안에 들어옴
 * - 음수/0/빈 categories 가드
 */

const LEFT_HEADER  = { label: '1차', subLabel: '상반기' };
const RIGHT_HEADER = { label: '2차', subLabel: '상반기' };

// rect의 width 속성 추출 — 첫 매치 N개
function extractRectWidths(html: string): number[] {
  const matches = html.match(/<rect [^>]*width="(\d+\.?\d*)"/g) ?? [];
  return matches.map((m) => {
    const num = m.match(/width="(\d+\.?\d*)"/);
    return num ? parseFloat(num[1]) : 0;
  });
}

describe('DemographicShiftBars 자동 정규화 (Phase 8-3)', () => {
  it('정상 데이터(0~100 비율) → 기존 SCALE(2.78) 그대로 적용 (회귀 0)', () => {
    // KB-Report 표준 케이스: 43.1, 39.6 (모두 100 이하)
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: '강남3구 매수자 거주지 변화',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: '강남3구', leftValue: 43.1, rightValue: 39.6, color: 'yellow' },
        ],
      }),
    );
    const widths = extractRectWidths(html);
    // 좌측 = 43.1 × 2.78 = 119.858
    // 우측 = 39.6 × 2.78 = 110.088
    expect(widths[0]).toBeCloseTo(43.1 * 2.78, 3);
    expect(widths[1]).toBeCloseTo(39.6 * 2.78, 3);
  });

  it('dataMax = 100 경계값 → SCALE 그대로 (회귀 0 안전망)', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: '경계값',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: 'A', leftValue: 100, rightValue: 90, color: 'yellow' },
        ],
      }),
    );
    const widths = extractRectWidths(html);
    // 100 × 2.78 = 278 = MAX_BAR_WIDTH. 임계와 정확히 일치 → 축소 미발동
    expect(widths[0]).toBeCloseTo(278, 3);
    expect(widths[1]).toBeCloseTo(90 * 2.78, 3);
  });

  it('큰 절댓값(200) → effectiveScale 자동 축소, MAX_BAR_WIDTH 안', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: '큰 값',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: 'A', leftValue: 200, rightValue: 150, color: 'red' },
        ],
      }),
    );
    const widths = extractRectWidths(html);
    // dataMax=200 → effectiveScale = 278/200 = 1.39
    // leftWidth = 200 × 1.39 = 278 (정확히 MAX_BAR_WIDTH)
    expect(widths[0]).toBeCloseTo(278, 3);
    // rightWidth = 150 × 1.39 = 208.5
    expect(widths[1]).toBeCloseTo(150 * (278 / 200), 3);
    // 모든 막대가 MAX_BAR_WIDTH 안
    widths.forEach((w) => expect(w).toBeLessThanOrEqual(278));
  });

  it('초대형 값(500) → 정규화 후에도 viewBox 안전', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: '초대형',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: 'A', leftValue: 500, rightValue: 300, color: 'amberOrange' },
        ],
      }),
    );
    const widths = extractRectWidths(html);
    // 500 × (278/500) = 278
    expect(widths[0]).toBeCloseTo(278, 3);
    widths.forEach((w) => expect(w).toBeLessThanOrEqual(278));
  });

  it('음수 값 → Math.abs로 정규화 기준 + 막대 폭은 0 클램프 (throw 없음)', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: '음수 포함',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: 'A', leftValue: -10, rightValue: 20, color: 'red' },
        ],
      }),
    );
    const widths = extractRectWidths(html);
    // leftWidth = max(0, -10 × scale) = 0
    expect(widths[0]).toBe(0);
    // rightWidth = 20 × 2.78 = 55.6 (dataMax=20 → 축소 미발동)
    expect(widths[1]).toBeCloseTo(20 * 2.78, 3);
  });

  it('모두 0 값 → effectiveScale = SCALE (분모 0 회피)', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: '0값',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: 'A', leftValue: 0, rightValue: 0, color: 'yellow' },
        ],
      }),
    );
    // throw 없이 렌더, 막대 width 0
    const widths = extractRectWidths(html);
    expect(widths[0]).toBe(0);
    expect(widths[1]).toBe(0);
  });

  it('다중 카테고리: dataMax 기준 통일 정규화 (모든 행 같은 effectiveScale)', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: '다중',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: 'A', leftValue: 200, rightValue: 50, color: 'red' },       // dataMax 후보
          { label: 'B', leftValue: 100, rightValue: 80, color: 'amberOrange' },
        ],
      }),
    );
    const widths = extractRectWidths(html);
    // dataMax=200 → scale=1.39
    // A 좌측 = 278, A 우측 = 50×1.39 = 69.5
    // B 좌측 = 100×1.39 = 139, B 우측 = 80×1.39 = 111.2
    const expectedScale = 278 / 200;
    expect(widths[0]).toBeCloseTo(200 * expectedScale, 3);
    expect(widths[1]).toBeCloseTo(50  * expectedScale, 3);
    expect(widths[2]).toBeCloseTo(100 * expectedScale, 3);
    expect(widths[3]).toBeCloseTo(80  * expectedScale, 3);
  });
});

describe('DemographicShiftBars Phase 8-1 가드 (회귀 0)', () => {
  it('categories가 배열이 아니면 placeholder 반환 (Phase 8-1)', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: 't',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        // @ts-expect-error
        categories: undefined,
      }),
    );
    expect(html).toContain('차트를 표시할 수 없습니다');
  });

  it('정상 데이터에 placeholder 출력 안 됨', () => {
    const html = renderToStaticMarkup(
      createElement(DemographicShiftBars, {
        title: 't',
        leftHeader: LEFT_HEADER,
        rightHeader: RIGHT_HEADER,
        categories: [
          { label: 'A', leftValue: 30, rightValue: 40, color: 'yellow' },
        ],
      }),
    );
    expect(html).not.toContain('차트를 표시할 수 없습니다');
  });
});
