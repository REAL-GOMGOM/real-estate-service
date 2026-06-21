/**
 * SparkLine 순수 함수 모듈 — 사이클 O Phase 1.
 *
 * 미니 추세선. 축·라벨 없음. 인라인 텍스트 흐름에 추세 표시.
 * 색상: color 명시 → 명시 / trendColor → 첫값<끝값 red, >끝값 blue, 같음 gray.
 */

import { CHART_COLORS, resolveChartColor, type ChartColor } from '@/lib/chart-colors';

/** 사이클 O Phase 1 — 차트별 alias 표준 패턴 */
export type SparkColor = ChartColor;

export interface AxisDomain {
  min: number;
  max: number;
}

/** 10% 패딩 — 평평한 선이 위/아래 경계에 붙지 않도록 호흡 공간 */
const PADDING_RATIO = 0.1;
/** 단일 값 또는 모두 동일 → ±이 값으로 0폭 방지 */
const FLAT_PADDING = 1;

/**
 * 도메인 계산 — min·max에 10% 패딩.
 *
 * - 빈 배열: { min: 0, max: 1 }
 * - 단일 값 또는 모두 동일: ±FLAT_PADDING으로 0폭 방지
 * - 정상: dataMin - range×0.1, dataMax + range×0.1
 */
export function computeSparkDomain(data: number[]): AxisDomain {
  if (data.length === 0) return { min: 0, max: 1 };

  const dataMin = Math.min(...data);
  const dataMax = Math.max(...data);

  if (dataMin === dataMax) {
    return { min: dataMin - FLAT_PADDING, max: dataMax + FLAT_PADDING };
  }

  const pad = (dataMax - dataMin) * PADDING_RATIO;
  return { min: dataMin - pad, max: dataMax + pad };
}

/**
 * 데이터 인덱스 → (cx, cy) 좌표 배열.
 *
 * x는 인덱스 균등 분포, y는 (val - min) / range로 reverse 매핑.
 * 단일 점은 가운데 배치.
 */
export function mapSparkPoints(
  data: number[],
  domain: AxisDomain,
  width: number,
  height: number,
  padding: number,
): { cx: number; cy: number }[] {
  if (data.length === 0) return [];
  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const yRange = domain.max - domain.min;

  return data.map((val, i) => {
    const cx = data.length === 1
      ? padding + innerW / 2
      : padding + (innerW * i) / (data.length - 1);
    const cy = yRange === 0
      ? padding + innerH / 2
      : padding + innerH * (1 - (val - domain.min) / yRange);
    return { cx, cy };
  });
}

/**
 * 색상 3-way 분기.
 *   1. color 명시 → resolveChartColor (hex/키워드 통합)
 *   2. color 없고 trendColor=true:
 *      - data 길이 < 2 → gray (추세 판정 불가)
 *      - data[0] < data[last] → red (상승)
 *      - data[0] > data[last] → blue (하락)
 *      - data[0] === data[last] → gray (평평)
 *   3. 둘 다 없음 → gray
 */
export function resolveSparkColor(
  data: number[],
  color?: ChartColor,
  trendColor?: boolean,
): string {
  if (color) return resolveChartColor(color, 0, 'series');
  if (!trendColor) return CHART_COLORS.gray;

  if (data.length < 2) return CHART_COLORS.gray;
  const first = data[0];
  const last  = data[data.length - 1];
  if (first < last) return CHART_COLORS.red;
  if (first > last) return CHART_COLORS.blue;
  return CHART_COLORS.gray;
}

/** 직선 폴리라인 SVG path. 빈 배열 → 빈 문자열. */
export function buildSparkPath(points: { cx: number; cy: number }[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const parts = [`M ${first.cx} ${first.cy}`];
  for (const p of rest) parts.push(`L ${p.cx} ${p.cy}`);
  return parts.join(' ');
}

/**
 * 면적 SVG path — 선 → baselineY까지 닫힘.
 * baselineY는 보통 SparkLine 하단(padding + innerH).
 */
export function buildSparkArea(
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
