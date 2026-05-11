/**
 * LineChart 순수 함수 모듈.
 *
 * 시계열·다중 시리즈·baseline·maxValue 처리 로직을 본체에서 분리해 단위 테스트 가능.
 * autoBaseline 공식은 HorizontalBarChart와 동일 (computeAutoBaseline 재사용).
 */

import { pickDefaultColor, type ColorKey } from '@/lib/chart-colors';
import { computeAutoBaseline } from './HorizontalBarChart.utils';

export type XValue = string | number;

export interface LinePoint {
  x: XValue;
  y: number;
}

export interface LineSeries {
  name:    string;
  color?:  ColorKey;
  data:    LinePoint[];
  filled?: boolean;
  dashed?: boolean;
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
 * y축 도메인 계산.
 * - autoBaseline: HorizontalBarChart와 동일 공식 (dataMin - range × 0.1, 음수 시 0)
 * - baseline: 사용자 명시값
 * - maxValue: 사용자 명시 시 max 상한
 * - 둘 다 미지정: min=0, max=dataMax
 *
 * 빈 데이터: { min: 0, max: 1 } (placeholder 안전).
 */
export function computeAxisDomain(
  series: LineSeries[],
  baseline?: number,
  autoBaseline?: boolean,
  maxValue?: number,
): AxisDomain {
  const allYs = series.flatMap((s) => s.data.map((d) => d.y));

  if (allYs.length === 0) return { min: 0, max: 1 };

  const min = autoBaseline
    ? computeAutoBaseline(allYs)
    : (baseline ?? 0);

  const dataMax = Math.max(...allYs);
  const max = maxValue !== undefined && maxValue > min ? maxValue : dataMax;

  // max <= min 보호 (단일 값이거나 baseline이 dataMax보다 큼)
  if (max <= min) return { min, max: min + 1 };

  return { min, max };
}

/**
 * 모든 시리즈에 등장하는 unique x값 (category 축 정렬용).
 * 첫 등장 순서 유지.
 */
export function collectXValues(series: LineSeries[]): XValue[] {
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
 * x값 타입 자동 감지. 모든 series의 첫 점 기준.
 * 빈 데이터 → 'category' (안전 default).
 */
export function detectXAxisType(series: LineSeries[]): 'category' | 'numeric' {
  for (const s of series) {
    if (s.data.length > 0) {
      return typeof s.data[0].x === 'number' ? 'numeric' : 'category';
    }
  }
  return 'category';
}

/**
 * (x, y) → (cx, cy) 변환.
 * - category 축: xValues 배열 인덱스 기반 균등 분포
 * - numeric 축: x값을 numericMin..numericMax로 선형 매핑
 *
 * 단일 점 (xValues.length === 1): plotArea 가운데에 배치.
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
 * filled 영역 SVG path.
 * 선 → x축 baseline까지 닫힌 영역.
 * 빈 배열 → 빈 문자열.
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
 * 시리즈별 색상 결정 우선순위:
 * 1. series.color 명시 지정 → 명시값
 * 2. 단일 시리즈 → blue (회색 단일은 죽은 차트처럼 보여서 강조색)
 * 3. 다중 시리즈 → pickDefaultColor(i, 'series')
 */
export function resolveSeriesColor(
  series: LineSeries,
  seriesIndex: number,
  totalSeries: number,
): ColorKey {
  if (series.color) return series.color;
  if (totalSeries === 1) return 'blue';
  return pickDefaultColor(seriesIndex, 'series');
}

/**
 * y축 tick 값들. 도메인을 균등 분할.
 * count: 0과 max 포함한 tick 개수 (예: 5 → 0, 25, 50, 75, 100% 패턴).
 */
export function computeYTicks(domain: AxisDomain, count: number): number[] {
  if (count < 2) return [domain.min, domain.max];
  const step = (domain.max - domain.min) / (count - 1);
  return Array.from({ length: count }, (_, i) => domain.min + step * i);
}

/**
 * 점이 maxValue를 초과해 클리핑됐는지 (y축 외곽 표시용).
 */
export function isPointClipped(
  y: number,
  yDomain: AxisDomain,
  maxValue?: number,
): { clipped: boolean; direction: 'up' | 'down' | null } {
  if (maxValue !== undefined && y > maxValue) return { clipped: true, direction: 'up' };
  if (y < yDomain.min) return { clipped: true, direction: 'down' };
  return { clipped: false, direction: null };
}

/** ariaDesc 자동 생성 — 시리즈 수·범위 요약. */
export function generateAriaDesc(
  series: LineSeries[],
  unit: string,
): string {
  if (series.length === 0) return '데이터가 없는 빈 차트';
  const allYs = series.flatMap((s) => s.data.map((d) => d.y));
  if (allYs.length === 0) return `${series.length}개 시리즈, 데이터 없음`;
  const min = Math.min(...allYs);
  const max = Math.max(...allYs);
  const seriesNames = series.map((s) => s.name).join(', ');
  return `${series.length}개 시리즈 (${seriesNames}). 값 범위 ${min.toFixed(1)}${unit} ~ ${max.toFixed(1)}${unit}.`;
}
