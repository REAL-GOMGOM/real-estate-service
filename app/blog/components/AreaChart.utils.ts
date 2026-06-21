/**
 * AreaChart 순수 함수 모듈 — 사이클 O Phase 1.
 *
 * 시계열 면적 차트. 단일/다중 시리즈 + stacked 모드(시리즈 누적) 지원.
 * 골든 템플릿은 LineChart.utils. 도메인·축·legend 패턴 그대로 차용.
 * 시리즈 색상 wrapper는 단일 시리즈 fallback을 LineChart와 동일하게 blue 강제.
 */

import { CHART_COLORS, resolveChartColor, type ChartColor } from '@/lib/chart-colors';
import { computeAutoBaseline } from './HorizontalBarChart.utils';

export type XValue = string | number;

/** 사이클 O Phase 1 — 차트별 alias 표준 패턴 */
export type AreaColor = ChartColor;

export interface AreaPoint {
  x: XValue;
  y: number;
}

export interface AreaSeries {
  name:   string;
  color?: ChartColor;
  data:   AreaPoint[];
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

/**
 * y축 도메인 계산. stacked=true면 각 x에서 시리즈 합의 max를 도메인 상한으로.
 *
 * - autoBaseline: dataMin - range × 0.1 (HorizontalBarChart 동일 공식, 음수 시 0)
 * - baseline: 사용자 명시값
 * - maxValue: 사용자 명시 시 max 상한
 * - 빈 데이터: { min: 0, max: 1 }
 */
export function computeAreaDomain(
  series: AreaSeries[],
  baseline?: number,
  autoBaseline?: boolean,
  maxValue?: number,
  stacked?: boolean,
): AxisDomain {
  const allYs = series.flatMap((s) => s.data.map((d) => d.y));
  if (allYs.length === 0) return { min: 0, max: 1 };

  const min = autoBaseline
    ? computeAutoBaseline(allYs)
    : (baseline ?? 0);

  let dataMax: number;
  if (stacked) {
    // 각 x에서 시리즈 합 → 최대값
    const xs = collectXValues(series);
    const sumsByX = xs.map((xv) =>
      series.reduce((acc, s) => {
        const pt = s.data.find((d) => d.x === xv);
        return acc + (pt ? pt.y : 0);
      }, 0),
    );
    dataMax = sumsByX.length > 0 ? Math.max(...sumsByX) : Math.max(...allYs);
  } else {
    dataMax = Math.max(...allYs);
  }

  const max = maxValue !== undefined && maxValue > min ? maxValue : dataMax;
  if (max <= min) return { min, max: min + 1 };
  return { min, max };
}

/**
 * 모든 시리즈에 등장하는 unique x값. 첫 등장 순서 유지.
 */
export function collectXValues(series: AreaSeries[]): XValue[] {
  const seen = new Set<XValue>();
  const out: XValue[] = [];
  for (const s of series) {
    for (const p of s.data) {
      if (!seen.has(p.x)) {
        seen.add(p.x);
        out.push(p.x);
      }
    }
  }
  return out;
}

/**
 * x값 타입 자동 감지. 빈 데이터 → 'category' (안전 default).
 */
export function detectXAxisType(series: AreaSeries[]): 'category' | 'numeric' {
  for (const s of series) {
    if (s.data.length > 0) {
      return typeof s.data[0].x === 'number' ? 'numeric' : 'category';
    }
  }
  return 'category';
}

/**
 * stacked 모드 누적값 계산.
 *
 * 결과: 시리즈명 → x별 누적 상단값 배열(xValues 순서).
 * 각 x에서 시리즈[0..i].y 합. 같은 x에 점이 없으면 0으로 처리(누적 영향 없음).
 *
 * 면적 그릴 때: lower = (직전 시리즈의 상단값), upper = (이 시리즈의 상단값)
 */
export function computeStackedValues(
  series: AreaSeries[],
  xValues: XValue[],
): Map<string, number[]> {
  const result = new Map<string, number[]>();
  const runningTotals = xValues.map(() => 0);

  for (const s of series) {
    const upper = xValues.map((xv, i) => {
      const pt = s.data.find((d) => d.x === xv);
      const y = pt ? pt.y : 0;
      runningTotals[i] += y;
      return runningTotals[i];
    });
    result.set(s.name, [...upper]);
  }
  return result;
}

/**
 * (x, y) → (cx, cy) 변환. LineChart.mapPointToCoord 동일 시그니처.
 */
export function mapPointToCoord(
  x: XValue,
  y: number,
  yDomain: AxisDomain,
  plotArea: PlotArea,
  xAxisType: 'category' | 'numeric',
  xValues: XValue[],
  numericMin?: number,
  numericMax?: number,
): { cx: number; cy: number } {
  let cx: number;
  if (xAxisType === 'category') {
    const idx = xValues.indexOf(x);
    if (xValues.length === 1) {
      cx = plotArea.x + plotArea.width / 2;
    } else if (idx < 0) {
      cx = plotArea.x;
    } else {
      cx = plotArea.x + (plotArea.width * idx) / (xValues.length - 1);
    }
  } else {
    const xn = typeof x === 'number' ? x : parseFloat(String(x));
    const lo = numericMin ?? Math.min(...xValues.map((v) => Number(v)));
    const hi = numericMax ?? Math.max(...xValues.map((v) => Number(v)));
    if (hi === lo) {
      cx = plotArea.x + plotArea.width / 2;
    } else {
      cx = plotArea.x + (plotArea.width * (xn - lo)) / (hi - lo);
    }
  }

  const yRange = yDomain.max - yDomain.min;
  const cy = plotArea.y + plotArea.height * (1 - (y - yDomain.min) / yRange);

  return { cx, cy };
}

/** 직선 폴리라인 SVG path. 빈 배열 → 빈 문자열. */
export function buildLinePath(points: { cx: number; cy: number }[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const parts = [`M ${first.cx} ${first.cy}`];
  for (const p of rest) parts.push(`L ${p.cx} ${p.cy}`);
  return parts.join(' ');
}

/**
 * non-stacked 면적 path — 선 → baselineY까지 닫힌 영역.
 * LineChart.buildAreaPath와 동일.
 */
export function buildAreaPath(
  points: { cx: number; cy: number }[],
  baselineY: number,
): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const last = points[points.length - 1];
  const parts = [`M ${first.cx} ${baselineY}`, `L ${first.cx} ${first.cy}`];
  for (const p of rest) parts.push(`L ${p.cx} ${p.cy}`);
  parts.push(`L ${last.cx} ${baselineY}`);
  parts.push('Z');
  return parts.join(' ');
}

/**
 * stacked 모드 면적 path — 상단 경계 + 하단 경계(역순)로 닫힌 다각형.
 *
 * upperPoints: 이 시리즈의 누적 상단 (왼→오)
 * lowerPoints: 직전 누적 상단 (왼→오) — 역순으로 그려 닫는다
 *
 * 길이 불일치 또는 빈 배열은 빈 문자열 반환.
 */
export function buildStackedAreaPath(
  upperPoints: { cx: number; cy: number }[],
  lowerPoints: { cx: number; cy: number }[],
): string {
  if (
    upperPoints.length === 0 ||
    upperPoints.length !== lowerPoints.length
  ) {
    return '';
  }
  const parts = [`M ${upperPoints[0].cx} ${upperPoints[0].cy}`];
  for (let i = 1; i < upperPoints.length; i++) {
    parts.push(`L ${upperPoints[i].cx} ${upperPoints[i].cy}`);
  }
  for (let i = lowerPoints.length - 1; i >= 0; i--) {
    parts.push(`L ${lowerPoints[i].cx} ${lowerPoints[i].cy}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * 시리즈별 색상 결정 — LineChart.resolveSeriesColor와 동일 정책.
 *
 * 우선순위:
 *   1. series.color 명시 → resolveChartColor (hex/키워드 통합)
 *   2. 미지정 + 단일 시리즈 → blue 강제 (회색 단일은 죽은 차트처럼 보임)
 *   3. 미지정 + 다중 시리즈 → pickDefaultColor(i, 'series') → gray 시작
 */
export function resolveAreaColor(
  series: AreaSeries,
  seriesIndex: number,
  totalSeries: number,
): string {
  if (!series.color && totalSeries === 1) return CHART_COLORS.blue;
  return resolveChartColor(series.color, seriesIndex, 'series');
}

/**
 * y축 tick 값들. 도메인을 균등 분할.
 */
export function computeYTicks(domain: AxisDomain, count: number): number[] {
  if (count < 2) return [domain.min, domain.max];
  const step = (domain.max - domain.min) / (count - 1);
  return Array.from({ length: count }, (_, i) => domain.min + step * i);
}

/** ariaDesc 자동 생성 — 시리즈 수·범위 요약. stacked일 때는 합계 범위. */
export function generateAriaDesc(
  series: AreaSeries[],
  unit: string,
  stacked?: boolean,
): string {
  if (series.length === 0) return '데이터가 없는 빈 면적 차트';
  const allYs = series.flatMap((s) => s.data.map((d) => d.y));
  if (allYs.length === 0) return `${series.length}개 시리즈, 데이터 없음`;

  const seriesNames = series.map((s) => s.name).join(', ');

  if (stacked) {
    const xs = collectXValues(series);
    const sums = xs.map((xv) =>
      series.reduce((acc, s) => {
        const pt = s.data.find((d) => d.x === xv);
        return acc + (pt ? pt.y : 0);
      }, 0),
    );
    const minSum = Math.min(...sums);
    const maxSum = Math.max(...sums);
    return `${series.length}개 시리즈 누적 면적 차트 (${seriesNames}). 합계 범위 ${minSum.toFixed(1)}${unit} ~ ${maxSum.toFixed(1)}${unit}.`;
  }

  const min = Math.min(...allYs);
  const max = Math.max(...allYs);
  return `${series.length}개 시리즈 면적 차트 (${seriesNames}). 값 범위 ${min.toFixed(1)}${unit} ~ ${max.toFixed(1)}${unit}.`;
}
