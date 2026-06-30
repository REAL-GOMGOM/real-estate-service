/**
 * GaugeChart — 반원 원호 게이지. 단일 값을 비율로.
 *
 * 사이클 O Phase 2 신규 컴포넌트.
 * 부동산 사용 예: 전고점 회복률, 공급 대비 수요율.
 *
 * 구조: 배경 호(회색 전체) + 값 호(min~value, 색상) 2겹.
 *   - 값 호만 색상 적용 (배경은 항상 회색) — 단순·명확 결정
 *   - 색상 우선순위: zones → color → getGradientFill(value)
 *
 * default 각도(180→0)는 상단 반원(좌→우, 12시 지남). 속도계 형태.
 */

'use client';

import { useId } from 'react';
import { warnInvalidChartColor, type ChartColor } from '@/lib/chart-colors';
import { CHART_TOKENS } from '@/lib/chart-tokens';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';
import {
  BACKGROUND_ARC_FILL,
  buildArcPath,
  clampValue,
  generateAriaDesc,
  resolveGaugeColor,
  valueToAngle,
  type GaugeZone,
} from './GaugeChart.utils';

interface GaugeChartProps {
  title:       string;
  value:       number;
  min?:        number;
  max?:        number;
  unit?:       string;
  width?:      number;
  height?:     number;
  zones?:      GaugeZone[];
  color?:      ChartColor;
  startAngle?: number;
  endAngle?:   number;
  showValue?:  boolean;
  thickness?:  number;
  ariaDesc?:   string;
}

const PADDING = {
  top:    40,    // 제목
  right:  24,
  bottom: 32,    // 중앙 값 텍스트
  left:   24,
} as const;

const DEFAULT_THICKNESS  = 24;
const DEFAULT_START_ANGLE = 180;
const DEFAULT_END_ANGLE   = 0;
const VALUE_TEXT_OFFSET   = 12; // 호 중심 아래 텍스트 미세 보정

export function GaugeChart({
  title,
  value,
  min        = 0,
  max        = 100,
  unit       = '%',
  width      = 320,
  height     = 200,
  zones,
  color,
  startAngle = DEFAULT_START_ANGLE,
  endAngle   = DEFAULT_END_ANGLE,
  showValue  = true,
  thickness  = DEFAULT_THICKNESS,
  ariaDesc,
}: GaugeChartProps) {
  // React Hooks 규칙: hook은 early return 전
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId  = `${chartId}-desc`;

  // Phase 8-1: 비정상 입력 방어 — value가 유한수가 아니면 placeholder
  // (NaN/누락이면 clampValue → NaN 전파로 SVG path 깨짐. 시각 불능 → 명시 placeholder)
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return <ChartErrorPlaceholder chartName="GaugeChart" reason={`value prop이 유한수가 아닙니다 (받은 값: ${String(value)})`} width={width} height={height} />;
  }

  const safeWidth  = Math.max(0, width);
  const safeHeight = Math.max(0, height);

  // dev mode 경고 — 알 수 없는 color 값
  if (process.env.NODE_ENV !== 'production') {
    warnInvalidChartColor('GaugeChart', color, 'color ');
    if (zones) {
      zones.forEach((z, idx) => {
        warnInvalidChartColor('GaugeChart', z.color, `zones[${idx}].`);
      });
    }
  }

  // ─── 비정상(max<=min) 가드 — placeholder ───
  if (max <= min) {
    return (
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{ariaDesc ?? '비정상 범위 (max<=min)'}</desc>
        <text
          x={safeWidth / 2}
          y={24}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.title}
          fontWeight={600}
          fill={CHART_TOKENS.fills.title}
        >
          {title}
        </text>
        <text
          x={safeWidth / 2}
          y={safeHeight / 2}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.label}
          fill={CHART_TOKENS.fills.subLabel}
        >
          비정상 범위
        </text>
      </svg>
    );
  }

  const cx = safeWidth / 2;
  // 반원 게이지는 호 아래쪽 절반이 비어있으니 호 중심을 살짝 아래로
  const cy = PADDING.top + (safeHeight - PADDING.top - PADDING.bottom) * 0.75;

  const usableW = Math.max(0, safeWidth - PADDING.left - PADDING.right);
  const usableH = Math.max(0, safeHeight - PADDING.top - PADDING.bottom);
  // 호 외경: 가로 기준(반원이라 너비의 절반)과 세로 기준 중 작은 값
  const outerRadius = Math.min(usableW / 2, usableH * 0.85);

  const clamped    = clampValue(value, min, max);
  const valueAngle = valueToAngle(clamped, min, max, startAngle, endAngle);
  const arcColor   = resolveGaugeColor(value, zones, color);

  const backgroundArc = buildArcPath(cx, cy, outerRadius, startAngle, endAngle, thickness);
  const valueArc      = buildArcPath(cx, cy, outerRadius, startAngle, valueAngle, thickness);

  const desc = ariaDesc ?? generateAriaDesc(value, min, max, unit);

  return (
    <svg
      viewBox={`0 0 ${safeWidth} ${safeHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
    >
      <title id={titleId}>{title}</title>
      <desc id={descId}>{desc}</desc>

      {/* 제목 */}
      <text
        x={safeWidth / 2}
        y={24}
        textAnchor="middle"
        fontSize={CHART_TOKENS.fontSize.title}
        fontWeight={600}
        fill={CHART_TOKENS.fills.title}
      >
        {title}
      </text>

      {/* 배경 호 (회색 전체 범위) */}
      <path d={backgroundArc} fill={BACKGROUND_ARC_FILL} opacity={0.2} />

      {/* 값 호 (min~value, 색상) — value==min이면 호가 안 보이는 게 정상 */}
      {clamped > min && (
        <path d={valueArc} fill={arcColor} />
      )}

      {/* 중앙 값 텍스트 (옵션) */}
      {showValue && (
        <text
          x={cx}
          y={cy + VALUE_TEXT_OFFSET}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.title}
          fontWeight={700}
          fill={CHART_TOKENS.fills.title}
        >
          {formatValue(value, unit)}
        </text>
      )}
    </svg>
  );
}

function formatValue(value: number, unit: string): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}${unit}`;
}

export type { GaugeZone, GaugeColor } from './GaugeChart.utils';
