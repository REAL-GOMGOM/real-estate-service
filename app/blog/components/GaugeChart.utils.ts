/**
 * GaugeChart 순수 함수 모듈 — 사이클 O Phase 2.
 *
 * 반원 원호 게이지. 단일 값을 비율로 표시.
 * 부동산 사용 예: 전고점 회복률, 공급 대비 수요율.
 *
 * 각도 컨벤션 (반드시 준수):
 * - angleDeg는 SVG 표준: 0°=3시, 90°=6시(SVG y 아래로), 180°=9시, 270°=12시
 * - default: startAngle=180(좌측 9시) → endAngle=0(우측 3시)
 * - 진행: angle 감소 방향(180→0). polarToCartesian의 sin이 감소 → y 감소 → 위쪽 호.
 * - 즉 default 게이지는 상단 반원(속도계 형태). 사용자 시각으로 좌→상→우.
 *
 * 색상 우선순위:
 *   1. zones 명시 → value <= upTo 첫 매칭 구간색 (모든 구간 초과면 마지막 구간색)
 *   2. zones 없고 color 명시 → resolveChartColor
 *   3. 둘 다 없음 → getGradientFill(value)
 *
 * 두께 있는 호: 외호(정방향) + 내호(역방향) + Z. sweep-flag 반전으로 면 닫음.
 */

import {
  CHART_COLORS,
  getGradientFill,
  resolveChartColor,
  type ChartColor,
} from '@/lib/chart-colors';

/** 사이클 O Phase 2 — 차트별 alias 표준 패턴 */
export type GaugeColor = ChartColor;

/** 게이지 구간 색상 — upTo 이하 구간 (오름차순 권장) */
export interface GaugeZone {
  upTo:  number;
  color: ChartColor;
}

/**
 * 값 → 각도 선형 보간.
 *
 * value=min → startAngle
 * value=max → endAngle
 * max <= min 가드 → startAngle 반환 (호 길이 0)
 *
 * 클램프는 별도(`clampValue`). 본 함수는 가공 없는 선형 매핑.
 */
export function valueToAngle(
  value: number,
  min: number,
  max: number,
  startAngle: number,
  endAngle: number,
): number {
  if (max <= min) return startAngle;
  const t = (value - min) / (max - min);
  return startAngle + (endAngle - startAngle) * t;
}

/**
 * 극좌표 → 직교좌표 (SVG 좌표계).
 *
 * SVG 컨벤션:
 * - 0°  → (cx + r, cy)       3시
 * - 90° → (cx, cy + r)       6시 (SVG y 아래로 증가)
 * - 180°→ (cx - r, cy)       9시
 * - 270°→ (cx, cy - r)       12시 (sin(270°)=-1 → y 감소)
 *
 * 표준 수학(y 위로) 컨벤션과 부호가 반대. 표준에서 90°는 위였지만 SVG에선 아래.
 */
export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

/**
 * 값 클램프 — 범위 밖 값이 호를 벗어나지 않게.
 * max <= min 가드 → min 반환.
 */
export function clampValue(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.max(min, Math.min(value, max));
}

/**
 * 두께 있는 호 SVG path.
 *
 * 알고리즘:
 *   1. 외호 시작 → A 외호 끝 (정방향)
 *   2. L 내호 끝 (반경 차)
 *   3. A 내호 시작 (역방향: sweep-flag 반전)
 *   4. Z (시작점 복귀)
 *
 * large-arc-flag: 각도 절대값 차 > 180° → 1, 아니면 0 (반원 = 0).
 * sweep-flag: angle 증가 방향이면 1, 감소면 0.
 *   default 게이지(180→0)는 감소 → sweep=0 → SVG에서 시각적 상단 호.
 *
 * thickness가 outerRadius보다 크면 innerRadius=0 (Pie형).
 */
export function buildArcPath(
  cx: number,
  cy: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  thickness: number,
): string {
  const innerRadius = Math.max(0, outerRadius - thickness);

  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd   = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const innerEnd   = polarToCartesian(cx, cy, innerRadius, endAngle);

  const angleDelta   = Math.abs(endAngle - startAngle);
  const largeArcFlag = angleDelta > 180 ? 1 : 0;
  // angle 증가 → sweep=1, 감소 → sweep=0
  const outerSweepFlag = endAngle >= startAngle ? 1 : 0;
  const innerSweepFlag = outerSweepFlag === 1 ? 0 : 1;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} ${outerSweepFlag} ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} ${innerSweepFlag} ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

/**
 * 색상 결정 — zones → color → gradient 순.
 *
 * zones는 upTo 오름차순 가정. value <= upTo 첫 매칭 구간색.
 * 모든 구간 초과 → 마지막 구간색(없으면 호출 안 됨).
 *
 * zones의 color는 ChartColor라 hex/키워드 모두 허용 (resolveChartColor 위임).
 * intent='category' (구간 분류 의도). color prop은 intent='series'.
 */
export function resolveGaugeColor(
  value: number,
  zones?: GaugeZone[],
  color?: ChartColor,
): string {
  if (zones && zones.length > 0) {
    for (const z of zones) {
      if (value <= z.upTo) {
        return resolveChartColor(z.color, 0, 'category');
      }
    }
    // 모든 구간 초과 → 마지막 구간색
    const last = zones[zones.length - 1];
    return resolveChartColor(last.color, 0, 'category');
  }
  if (color) {
    return resolveChartColor(color, 0, 'series');
  }
  return getGradientFill(value);
}

/** 배경 호 색상 — 항상 회색(CHART_TOKENS.fills.grid). */
export const BACKGROUND_ARC_FILL = CHART_COLORS.gray;

/** ariaDesc 자동 생성. */
export function generateAriaDesc(
  value: number,
  min: number,
  max: number,
  unit: string,
): string {
  const clamped = clampValue(value, min, max);
  const pct = max > min ? ((clamped - min) / (max - min)) * 100 : 0;
  return `게이지 ${value.toFixed(1)}${unit} (범위 ${min}${unit} ~ ${max}${unit}, ${pct.toFixed(0)}%).`;
}
