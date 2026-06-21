/**
 * RangeBarChart 순수 함수 모듈 — 사이클 O Phase 2.
 *
 * 항목별 min~max 범위 가로 막대(floating bar).
 * 부동산 사용 예: 단지별 실거래 최저~최고가, 평형별 시세 밴드.
 *
 * 색상: intent='category' (항목 독립 분포, index 0 = red 강조).
 * 단일 항목 fallback 없음.
 *
 * floating: 막대가 0이 아닌 min에서 시작.
 *   x = mapValueToX(min)
 *   width = mapValueToX(max) - mapValueToX(min)
 */

import { resolveChartColor, type ChartColor } from '@/lib/chart-colors';

/** 사이클 O Phase 2 — 차트별 alias 표준 패턴 */
export type RangeColor = ChartColor;

export interface RangeItem {
  label: string;
  min:   number;
  max:   number;
  color?: ChartColor;
}

export interface PlotArea {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface AxisDomain {
  min: number;
  max: number;
}

/** 5% 패딩 + min==max 점 막대 가드 최소 너비 */
const AUTO_PADDING_RATIO = 0.05;
const SINGLE_VALUE_PADDING = 1;
/**
 * min==max 점 막대 시각 가드. 너비 0이면 SVG에서 막대가 안 보임 → 최소 2px.
 * 시각 일관성을 위해 점 마커 대신 가는 막대로 유지(막대 차트 정합).
 */
export const MIN_BAR_WIDTH = 2;

/**
 * 도메인 계산 — 전체 min/max에 5% 패딩.
 *
 * - 사용자 domainMin/domainMax 명시 시 우선
 * - 빈 items / 모두 동일 값: ±SINGLE_VALUE_PADDING으로 0폭 방지
 * - 사용자 값 뒤집힘(max<=min) 보호
 */
export function computeRangeDomain(
  items: RangeItem[],
  domainMin?: number,
  domainMax?: number,
): AxisDomain {
  if (items.length === 0) {
    return {
      min: domainMin ?? -SINGLE_VALUE_PADDING,
      max: domainMax ?? SINGLE_VALUE_PADDING,
    };
  }

  const allValues = items.flatMap((it) => [it.min, it.max]);
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);

  if (dataMin === dataMax) {
    return {
      min: domainMin ?? dataMin - SINGLE_VALUE_PADDING,
      max: domainMax ?? dataMax + SINGLE_VALUE_PADDING,
    };
  }

  const range = dataMax - dataMin;
  const pad   = range * AUTO_PADDING_RATIO;
  let min = domainMin ?? dataMin - pad;
  let max = domainMax ?? dataMax + pad;

  // 사용자 값 뒤집힘 보호
  if (max <= min) {
    max = min + SINGLE_VALUE_PADDING;
  }
  return { min, max };
}

/** 값 → x좌표 선형 매핑. 도메인 0폭 가드(plotArea 가운데). */
export function mapValueToX(
  value: number,
  domain: AxisDomain,
  plotArea: PlotArea,
): number {
  const range = domain.max - domain.min;
  if (range === 0) return plotArea.x + plotArea.width / 2;
  return plotArea.x + (plotArea.width * (value - domain.min)) / range;
}

/**
 * 막대 geometry — min~max를 막대 x·너비로.
 *
 * 가드:
 * - max < min: 입력값 swap (절대값 처리, 회귀 안전)
 * - min == max: 너비 MIN_BAR_WIDTH(2px)로 점 막대 표시
 * - 정상: x = mapValueToX(min), width = mapValueToX(max) - x
 */
export function computeBarGeometry(
  item: RangeItem,
  domain: AxisDomain,
  plotArea: PlotArea,
): { x: number; width: number } {
  const lo = Math.min(item.min, item.max);
  const hi = Math.max(item.min, item.max);

  const xLo = mapValueToX(lo, domain, plotArea);
  const xHi = mapValueToX(hi, domain, plotArea);
  const rawWidth = xHi - xLo;

  if (rawWidth < MIN_BAR_WIDTH) {
    return { x: xLo, width: MIN_BAR_WIDTH };
  }
  return { x: xLo, width: rawWidth };
}

/**
 * 항목 색상 결정.
 * intent='category' — index 0 = red. 단일 항목 fallback 없음.
 */
export function resolveRangeColor(
  item: RangeItem,
  itemIndex: number,
): string {
  return resolveChartColor(item.color, itemIndex, 'category');
}

/** 중앙값 — (min + max) / 2. */
export function computeMidpoint(item: RangeItem): number {
  return (item.min + item.max) / 2;
}

/** x축 tick — 도메인 균등 분할. */
export function computeXTicks(domain: AxisDomain, count: number): number[] {
  if (count < 2) return [domain.min, domain.max];
  const step = (domain.max - domain.min) / (count - 1);
  return Array.from({ length: count }, (_, i) => domain.min + step * i);
}

/** ariaDesc 자동 생성 — 항목 수 + 범위 요약. */
export function generateAriaDesc(items: RangeItem[], unit: string): string {
  if (items.length === 0) return '데이터가 없는 빈 범위 막대 차트';
  const allValues = items.flatMap((it) => [it.min, it.max]);
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const labels = items.map((it) => it.label).join(', ');
  return `${items.length}개 항목 (${labels}). 전체 범위 ${dataMin.toFixed(1)}${unit} ~ ${dataMax.toFixed(1)}${unit}.`;
}
