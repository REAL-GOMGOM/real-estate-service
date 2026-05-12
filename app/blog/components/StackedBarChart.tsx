/**
 * StackedBarChart — 다중 세그먼트 누적 막대 차트 (vertical)
 *
 * 사이클 N 신규. 모델:
 * - 가로 축 = bar.label (예: 분기·자치구·연도)
 * - 세로 축 = segment value 누적 (또는 percentMode=true 시 0~100%)
 * - 같은 index segment는 같은 색상 → bar 간 비교 용이
 *
 * 패턴 일관:
 * - 자체 SVG
 * - lib/chart-tokens + lib/chart-colors 재사용
 * - <title>·<desc>·role='img'·aria-labelledby
 */

'use client';

import { useId } from 'react';
import { warnInvalidChartColor } from '@/lib/chart-colors';
import { CHART_TOKENS, estimateTextWidth } from '@/lib/chart-tokens';
import {
  normalizeBars,
  resolveSegmentColor,
  computeChartMax,
  buildLegendEntries,
  generateAriaDesc,
  formatSegmentLabel,
  type StackedBar,
} from './StackedBarChart.utils';

interface StackedBarChartProps {
  bars:                StackedBar[];
  title?:              string;
  unit?:               string;            // y축 단위 (예: '%', '건'), default ''
  percentMode?:        boolean;           // true: 각 bar 합계 100% 정규화
  showSegmentLabels?:  boolean;           // segment 내부에 value 표시 (높이 충분 시)
  showLegend?:         boolean;           // default true (segments.length > 1일 때 자동)
  ariaDesc?:           string;
  width?:              number;            // default 640
  height?:             number;            // default 360
}

const PADDING = {
  top:    60,    // 제목 + legend
  right:  24,
  bottom: 56,    // x축 라벨
  left:   60,    // y축 라벨
} as const;

const BAR_WIDTH_RATIO         = 0.7;     // 카테고리 폭의 70%, 30%는 간격
const SEGMENT_LABEL_MIN_HEIGHT = 18;     // 이 픽셀 이상이어야 세그먼트 안에 라벨 표시
const SEGMENT_BORDER_WIDTH     = 1;
const SEGMENT_BORDER_COLOR     = '#ffffff';
const GRID_TICK_COUNT          = 5;

export function StackedBarChart({
  bars,
  title,
  unit              = '',
  percentMode       = false,
  showSegmentLabels = false,
  showLegend,
  ariaDesc,
  width             = 640,
  height            = 360,
}: StackedBarChartProps) {
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId  = `${chartId}-desc`;

  const safeWidth  = Math.max(0, width);
  const safeHeight = Math.max(0, height);

  // dev mode 경고 — 음수 segment value + 알 수 없는 color 값
  if (process.env.NODE_ENV !== 'production') {
    const hasNeg = bars.some((b) => b.segments.some((s) => s.value < 0));
    if (hasNeg) {
      // eslint-disable-next-line no-console
      console.warn(`[StackedBarChart] "${title ?? ''}" 음수 segment value 감지 — 0으로 처리됨`);
    }
    // 사이클 S Step S-1: 알 수 없는 color 값 → 자동 할당 안내
    bars.forEach((bar, barIdx) => {
      bar.segments.forEach((seg, segIdx) => {
        warnInvalidChartColor(
          'StackedBarChart',
          seg.color,
          `bars[${barIdx}].segments[${segIdx}].`,
        );
      });
    });
  }

  const plotArea = {
    x:      PADDING.left,
    y:      PADDING.top,
    width:  Math.max(0, safeWidth - PADDING.left - PADDING.right),
    height: Math.max(0, safeHeight - PADDING.top - PADDING.bottom),
  };

  const effectiveTitle = title ?? '';
  const desc = ariaDesc ?? generateAriaDesc(bars);

  // 빈 데이터 placeholder
  if (bars.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
      >
        <title id={titleId}>{effectiveTitle}</title>
        <desc id={descId}>{ariaDesc ?? '데이터가 없는 빈 누적 막대 차트'}</desc>
        {effectiveTitle && (
          <text
            x={safeWidth / 2}
            y={24}
            textAnchor="middle"
            fontSize={CHART_TOKENS.fontSize.title}
            fontWeight={600}
            fill={CHART_TOKENS.fills.title}
          >
            {effectiveTitle}
          </text>
        )}
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

  const normalized = normalizeBars(bars, percentMode);
  const chartMax = percentMode ? 100 : computeChartMax(normalized);
  // y축 스케일 0 방어
  const safeMax = chartMax > 0 ? chartMax : 1;

  const barCount = normalized.length;
  const slotWidth = plotArea.width / Math.max(1, barCount);
  const barWidth = slotWidth * BAR_WIDTH_RATIO;

  // legend
  const legendEntries = buildLegendEntries(bars);
  const effectiveShowLegend = showLegend ?? legendEntries.length > 1;

  // y축 tick
  const yTicks = Array.from({ length: GRID_TICK_COUNT }, (_, i) => (safeMax * i) / (GRID_TICK_COUNT - 1));

  return (
    <svg
      viewBox={`0 0 ${safeWidth} ${safeHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
    >
      <title id={titleId}>{effectiveTitle}</title>
      <desc id={descId}>{desc}</desc>

      {/* 제목 */}
      {effectiveTitle && (
        <text
          x={safeWidth / 2}
          y={24}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.title}
          fontWeight={600}
          fill={CHART_TOKENS.fills.title}
        >
          {effectiveTitle}
        </text>
      )}

      {/* legend */}
      {effectiveShowLegend && (
        <Legend
          entries={legendEntries.map((e) => ({
            ...e,
            color: resolveSegmentColor(
              bars[0]?.segments[e.index] ?? { label: e.label, value: 0 },
              e.index,
            ),
          }))}
          x={safeWidth - PADDING.right}
          y={44}
        />
      )}

      {/* y축 + 그리드 */}
      <line
        x1={plotArea.x}
        y1={plotArea.y}
        x2={plotArea.x}
        y2={plotArea.y + plotArea.height}
        stroke={CHART_TOKENS.fills.axis}
        strokeWidth={1}
      />
      {yTicks.map((tick) => {
        const y = plotArea.y + plotArea.height * (1 - tick / safeMax);
        const isFloor = tick === 0;
        return (
          <g key={tick}>
            {!isFloor && (
              <line
                x1={plotArea.x}
                y1={y}
                x2={plotArea.x + plotArea.width}
                y2={y}
                stroke={CHART_TOKENS.fills.grid}
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={plotArea.x - 8}
              y={y + 4}
              textAnchor="end"
              fontSize={CHART_TOKENS.fontSize.subLabel}
              fill={CHART_TOKENS.fills.subLabel}
            >
              {formatTick(tick, unit)}
            </text>
          </g>
        );
      })}

      {/* x축 */}
      <line
        x1={plotArea.x}
        y1={plotArea.y + plotArea.height}
        x2={plotArea.x + plotArea.width}
        y2={plotArea.y + plotArea.height}
        stroke={CHART_TOKENS.fills.axis}
        strokeWidth={1}
      />

      {/* bars */}
      {normalized.map((nBar, barIdx) => {
        const barCenterX = plotArea.x + slotWidth * (barIdx + 0.5);
        const barX = barCenterX - barWidth / 2;
        return (
          <g key={`bar-${barIdx}-${nBar.bar.label}`}>
            {nBar.segments.map((nSeg) => {
              if (nSeg.displayValue <= 0) return null;
              const segHeight = (nSeg.displayValue / safeMax) * plotArea.height;
              const segY = plotArea.y + plotArea.height - ((nSeg.cumOffset + nSeg.displayValue) / safeMax) * plotArea.height;
              const fill = resolveSegmentColor(nSeg.segment, nSeg.index);
              return (
                <g key={`seg-${barIdx}-${nSeg.index}`}>
                  <rect
                    x={barX}
                    y={segY}
                    width={barWidth}
                    height={segHeight}
                    fill={fill}
                    stroke={SEGMENT_BORDER_COLOR}
                    strokeWidth={SEGMENT_BORDER_WIDTH}
                  />
                  {showSegmentLabels && segHeight >= SEGMENT_LABEL_MIN_HEIGHT && (
                    <text
                      x={barX + barWidth / 2}
                      y={segY + segHeight / 2 + 4}
                      textAnchor="middle"
                      fontSize={CHART_TOKENS.fontSize.subLabel}
                      fill="#ffffff"
                      fontWeight={600}
                    >
                      {formatSegmentLabel(nSeg.displayValue, unit, percentMode)}
                    </text>
                  )}
                </g>
              );
            })}
            {/* x축 라벨 */}
            <text
              x={barCenterX}
              y={plotArea.y + plotArea.height + 18}
              textAnchor="middle"
              fontSize={CHART_TOKENS.fontSize.subLabel}
              fill={CHART_TOKENS.fills.subLabel}
            >
              {nBar.bar.label}
            </text>
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

function Legend({
  entries,
  x,
  y,
}: {
  entries: Array<{ label: string; index: number; color: string }>;
  x: number;
  y: number;
}) {
  // 우측 정렬 — DonutChart·LineChart와 동일 너비 추정
  const GAP = 16;
  const DOT = 10;
  let cursor = x;
  const placed: Array<{ label: string; color: string; xAnchor: number }> = [];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    const estW = estimateTextWidth(e.label) + DOT + 6;
    cursor -= estW;
    placed.unshift({ label: e.label, color: e.color, xAnchor: cursor });
    cursor -= GAP;
  }

  return (
    <g>
      {placed.map((p) => (
        <g key={p.label}>
          <rect x={p.xAnchor} y={y - 6} width={DOT} height={DOT} fill={p.color} />
          <text
            x={p.xAnchor + DOT + 4}
            y={y + 4}
            fontSize={CHART_TOKENS.fontSize.subLabel}
            fill={CHART_TOKENS.fills.header}
          >
            {p.label}
          </text>
        </g>
      ))}
    </g>
  );
}

export type { StackedBar, StackedSegment } from './StackedBarChart.utils';
