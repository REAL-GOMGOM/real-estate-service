/**
 * ScatterPlot 순수 함수 모듈 — 사이클 O Phase 1.
 *
 * 산점도. 양축 numeric. 그룹별 색상.
 * intent='category' — 단일 그룹 fallback 없음(index 0 = red).
 * 라벨 충돌 회피는 백로그 항목으로 별도. 본 모듈은 좌표 매핑까지만.
 */

import { resolveChartColor, type ChartColor } from '@/lib/chart-colors';

/** 사이클 O Phase 1 — 차트별 alias 표준 패턴 */
export type ScatterColor = ChartColor;

export interface ScatterDot {
  x:      number;
  y:      number;
  label?: string;
}

export interface ScatterGroup {
  name:   string;
  color?: ChartColor;
  dots:   ScatterDot[];
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

/** 5% 패딩 + 단일 점 가드(min==max → ±1) */
const AUTO_PADDING_RATIO = 0.05;
const SINGLE_VALUE_PADDING = 1;

/**
 * 양축 독립 도메인 계산.
 *
 * - 사용자 min/max 명시 시 그대로 사용 (한쪽만 지정 가능)
 * - auto 시: dataMin - range×0.05, dataMax + range×0.05
 * - 단일 점(min==max) 또는 빈 데이터: ±SINGLE_VALUE_PADDING 강제로 0폭 방지
 *
 * @param axis 'x' 또는 'y' — dots에서 추출할 값 선택
 */
export function computeScatterDomain(
  groups: ScatterGroup[],
  axis: 'x' | 'y',
  userMin?: number,
  userMax?: number,
): AxisDomain {
  const values = groups.flatMap((g) => g.dots.map((d) => d[axis]));
  if (values.length === 0) {
    const fallback = userMin ?? 0;
    return {
      min: userMin ?? fallback - SINGLE_VALUE_PADDING,
      max: userMax ?? fallback + SINGLE_VALUE_PADDING,
    };
  }

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  // 단일 점 (min==max) → ±SINGLE_VALUE_PADDING으로 0폭 방지
  if (dataMin === dataMax) {
    return {
      min: userMin ?? dataMin - SINGLE_VALUE_PADDING,
      max: userMax ?? dataMax + SINGLE_VALUE_PADDING,
    };
  }

  const range = dataMax - dataMin;
  const pad   = range * AUTO_PADDING_RATIO;
  const min = userMin ?? dataMin - pad;
  let max = userMax ?? dataMax + pad;

  // 사용자 값이 도메인을 뒤집은 경우 보호
  if (max <= min) {
    max = min + SINGLE_VALUE_PADDING;
  }
  return { min, max };
}

/**
 * (x, y) → (cx, cy) 변환. 양축 numeric 선형 매핑.
 */
export function mapDotToCoord(
  dot: ScatterDot,
  xDomain: AxisDomain,
  yDomain: AxisDomain,
  plotArea: PlotArea,
): { cx: number; cy: number } {
  const xRange = xDomain.max - xDomain.min;
  const yRange = yDomain.max - yDomain.min;

  const cx = xRange === 0
    ? plotArea.x + plotArea.width / 2
    : plotArea.x + (plotArea.width * (dot.x - xDomain.min)) / xRange;

  const cy = yRange === 0
    ? plotArea.y + plotArea.height / 2
    : plotArea.y + plotArea.height * (1 - (dot.y - yDomain.min) / yRange);

  return { cx, cy };
}

/**
 * 그룹별 색상 결정.
 *
 * intent='category' — 단일 그룹 fallback 없음(AreaChart/LineChart의 blue 강제와 다름).
 * 우선순위:
 *   1. group.color 명시 → resolveChartColor (hex/키워드)
 *   2. 미지정 → pickDefaultColor(i, 'category') → red 시작
 */
export function resolveGroupColor(
  group: ScatterGroup,
  groupIndex: number,
): string {
  return resolveChartColor(group.color, groupIndex, 'category');
}

/** y축 tick 값들. 도메인 균등 분할. */
export function computeYTicks(domain: AxisDomain, count: number): number[] {
  if (count < 2) return [domain.min, domain.max];
  const step = (domain.max - domain.min) / (count - 1);
  return Array.from({ length: count }, (_, i) => domain.min + step * i);
}

/** x축 tick 값들 (동일 공식, 의도 가시성 위해 alias). */
export function computeXTicks(domain: AxisDomain, count: number): number[] {
  return computeYTicks(domain, count);
}

/** ariaDesc 자동 생성 — 그룹 수·점 수·축 범위 요약. */
export function generateAriaDesc(
  groups: ScatterGroup[],
  xUnit: string,
  yUnit: string,
): string {
  if (groups.length === 0) return '데이터가 없는 빈 산점도';
  const totalDots = groups.reduce((acc, g) => acc + g.dots.length, 0);
  if (totalDots === 0) return `${groups.length}개 그룹, 데이터 없음`;

  const xs = groups.flatMap((g) => g.dots.map((d) => d.x));
  const ys = groups.flatMap((g) => g.dots.map((d) => d.y));
  const groupNames = groups.map((g) => g.name).join(', ');

  return `${groups.length}개 그룹 (${groupNames}), 총 ${totalDots}개 점. ` +
    `x 범위 ${Math.min(...xs).toFixed(1)}${xUnit} ~ ${Math.max(...xs).toFixed(1)}${xUnit}, ` +
    `y 범위 ${Math.min(...ys).toFixed(1)}${yUnit} ~ ${Math.max(...ys).toFixed(1)}${yUnit}.`;
}
