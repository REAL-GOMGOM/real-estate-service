/**
 * RangeBarChart — 항목별 min~max 범위 가로 막대(floating bar).
 *
 * 사이클 O Phase 2 신규 컴포넌트.
 * 부동산 사용 예: 단지별 실거래 최저~최고가, 평형별 시세 밴드.
 *
 * 특수:
 * - 막대가 0에서 시작 안 함 (min에서 시작, max까지). HorizontalBarChart 정책과 다름.
 * - intent='category' (index 0 = red), 단일 항목 fallback 없음.
 * - min==max 점 막대는 MIN_BAR_WIDTH(2px)로 시각 가드 (점 마커 미사용 — 막대 일관성 유지).
 */

'use client';

import { useId } from 'react';
import { warnInvalidChartColor } from '@/lib/chart-colors';
import { CHART_TOKENS } from '@/lib/chart-tokens';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';
import {
  computeBarGeometry,
  computeMidpoint,
  computeRangeDomain,
  computeXTicks,
  generateAriaDesc,
  mapValueToX,
  resolveRangeColor,
  type RangeItem,
} from './RangeBarChart.utils';

interface RangeBarChartProps {
  title:         string;
  items:         RangeItem[];
  unit?:         string;
  width?:        number;
  height?:       number;
  domainMin?:    number;
  domainMax?:    number;
  showValues?:   boolean;
  showMidpoint?: boolean;
  barHeight?:    number;
  ariaDesc?:     string;
}

const PADDING = {
  top:    50,
  right:  60,    // 우측 max 라벨 여유
  bottom: 40,    // x축 라벨
  left:   100,   // 좌측 항목명 + min 라벨
} as const;

const ROW_GAP            = 16;
const GRID_TICK_COUNT    = 5;
const LABEL_GAP          = 6;
const MIDPOINT_STROKE    = 2;
const DEFAULT_BAR_HEIGHT = 24;

export function RangeBarChart({
  title,
  items,
  unit         = '%',
  width        = 640,
  height,
  domainMin,
  domainMax,
  showValues   = true,
  showMidpoint = false,
  barHeight    = DEFAULT_BAR_HEIGHT,
  ariaDesc,
}: RangeBarChartProps) {
  // React Hooks 규칙: hook은 early return 전
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId  = `${chartId}-desc`;

  // Phase 8-1: 비정상 입력 방어
  if (!Array.isArray(items)) {
    return <ChartErrorPlaceholder chartName="RangeBarChart" reason="items prop이 배열이 아닙니다" width={width} height={height} />;
  }

  const safeWidth  = Math.max(0, width);
  // height 미지정 시 항목 수 기반 동적
  const rowPitch   = barHeight + ROW_GAP;
  const safeHeight = Math.max(
    0,
    height ?? PADDING.top + PADDING.bottom + Math.max(1, items.length) * rowPitch,
  );

  const plotArea = {
    x:      PADDING.left,
    y:      PADDING.top,
    width:  Math.max(0, safeWidth - PADDING.left - PADDING.right),
    height: Math.max(0, safeHeight - PADDING.top - PADDING.bottom),
  };

  // dev mode 경고 — 알 수 없는 color
  if (process.env.NODE_ENV !== 'production') {
    items.forEach((it, idx) => {
      warnInvalidChartColor('RangeBarChart', it.color, `items[${idx}].`);
    });
  }

  const desc = ariaDesc ?? generateAriaDesc(items, unit);

  // ─── 빈 데이터 placeholder ───
  if (items.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{ariaDesc ?? '데이터가 없는 빈 범위 막대 차트'}</desc>
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
        <rect
          x={plotArea.x}
          y={plotArea.y}
          width={plotArea.width}
          height={plotArea.height}
          fill={CHART_TOKENS.fills.grid}
          opacity={0.3}
        />
        <text
          x={safeWidth / 2}
          y={plotArea.y + plotArea.height / 2}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.label}
          fill={CHART_TOKENS.fills.subLabel}
        >
          데이터 없음
        </text>
      </svg>
    );
  }

  const domain = computeRangeDomain(items, domainMin, domainMax);
  const xTicks = computeXTicks(domain, GRID_TICK_COUNT);

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

      {/* x축 그리드 + tick 라벨 (하단) */}
      {xTicks.map((tick) => {
        const x = mapValueToX(tick, domain, plotArea);
        return (
          <g key={`x-${tick}`}>
            <line
              x1={x}
              y1={plotArea.y}
              x2={x}
              y2={plotArea.y + plotArea.height}
              stroke={CHART_TOKENS.fills.grid}
              strokeWidth={0.5}
              strokeDasharray="3 3"
            />
            <text
              x={x}
              y={plotArea.y + plotArea.height + 18}
              textAnchor="middle"
              fontSize={CHART_TOKENS.fontSize.subLabel}
              fill={CHART_TOKENS.fills.subLabel}
            >
              {formatTick(tick, unit)}
            </text>
          </g>
        );
      })}

      {/* x축 선 */}
      <line
        x1={plotArea.x}
        y1={plotArea.y + plotArea.height}
        x2={plotArea.x + plotArea.width}
        y2={plotArea.y + plotArea.height}
        stroke={CHART_TOKENS.fills.axis}
        strokeWidth={1}
      />

      {/* 항목별 막대 */}
      {items.map((item, i) => {
        const yRow = plotArea.y + i * rowPitch;
        const yBar = yRow + (rowPitch - barHeight) / 2;
        const fill = resolveRangeColor(item, i);
        const { x: barX, width: barWidth } = computeBarGeometry(item, domain, plotArea);
        const midpoint  = computeMidpoint(item);
        const midX      = mapValueToX(midpoint, domain, plotArea);

        return (
          <g key={`item-${i}-${item.label}`}>
            {/* 항목명 (좌측, 우측 정렬) */}
            <text
              x={plotArea.x - LABEL_GAP}
              y={yBar + barHeight / 2 + 4}
              textAnchor="end"
              fontSize={CHART_TOKENS.fontSize.subLabel}
              fill={CHART_TOKENS.fills.header}
              fontWeight={600}
            >
              {item.label}
            </text>

            {/* 막대 (floating: min~max) */}
            <rect
              x={barX}
              y={yBar}
              width={barWidth}
              height={barHeight}
              fill={fill}
              rx={2}
            />

            {/* min/max 값 라벨 (막대 양끝 바깥) */}
            {showValues && (
              <>
                <text
                  x={barX - LABEL_GAP}
                  y={yBar + barHeight / 2 + 4}
                  textAnchor="end"
                  fontSize={CHART_TOKENS.fontSize.subLabel}
                  fill={CHART_TOKENS.fills.subLabel}
                >
                  {formatValue(item.min, unit)}
                </text>
                <text
                  x={barX + barWidth + LABEL_GAP}
                  y={yBar + barHeight / 2 + 4}
                  textAnchor="start"
                  fontSize={CHART_TOKENS.fontSize.subLabel}
                  fill={CHART_TOKENS.fills.subLabel}
                >
                  {formatValue(item.max, unit)}
                </text>
              </>
            )}

            {/* 중앙값 세로 마커 (옵션) */}
            {showMidpoint && (
              <line
                x1={midX}
                y1={yBar - 2}
                x2={midX}
                y2={yBar + barHeight + 2}
                stroke="#ffffff"
                strokeWidth={MIDPOINT_STROKE}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function formatTick(value: number, unit: string): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}${unit}`;
}

function formatValue(value: number, unit: string): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}${unit}`;
}

export type { RangeItem, RangeColor } from './RangeBarChart.utils';
