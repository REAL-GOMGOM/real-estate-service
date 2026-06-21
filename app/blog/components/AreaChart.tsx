/**
 * AreaChart — 시계열 면적 차트. 단일/다중 시리즈 + stacked 모드.
 *
 * 사이클 O Phase 1 신규 컴포넌트. LineChart 골든 템플릿 그대로 따름:
 * - 자체 SVG (Recharts·d3 미사용)
 * - lib/chart-colors, lib/chart-tokens 재사용
 * - viewBox 100% width 반응형
 * - 접근성: <title>, <desc>, role="img"
 *
 * stacked=true: 각 x에서 시리즈를 누적해 위로 쌓는다. 첫 시리즈가 바닥, 마지막이 최상단.
 * stacked=false: 각 시리즈를 baseline까지 독립 면적으로 그린다.
 */

'use client';

import { useId } from 'react';
import { warnInvalidChartColor } from '@/lib/chart-colors';
import { CHART_TOKENS, estimateTextWidth } from '@/lib/chart-tokens';
import {
  buildAreaPath,
  buildLinePath,
  buildStackedAreaPath,
  collectXValues,
  computeAreaDomain,
  computeStackedValues,
  computeYTicks,
  detectXAxisType,
  generateAriaDesc,
  mapPointToCoord,
  resolveAreaColor,
  type AreaSeries,
} from './AreaChart.utils';

interface AreaChartProps {
  title:        string;
  series:       AreaSeries[];
  unit?:        string;
  xAxisLabel?:  string;
  yAxisLabel?:  string;
  width?:       number;
  height?:      number;
  baseline?:    number;
  autoBaseline?: boolean;
  maxValue?:    number;
  stacked?:     boolean;
  showGrid?:    boolean;
  showLegend?:  boolean;
  ariaDesc?:    string;
}

const PADDING = {
  top:    60,
  right:  24,
  bottom: 56,
  left:   60,
} as const;

const LINE_STROKE_WIDTH = 2;
const FILL_OPACITY      = 0.25;
const STACKED_OPACITY   = 0.85;
const GRID_TICK_COUNT   = 5;
const LEGEND_ITEM_GAP   = 16;
const LEGEND_DOT_SIZE   = 10;

export function AreaChart({
  title,
  series,
  unit         = '%',
  xAxisLabel,
  yAxisLabel,
  width        = 640,
  height       = 360,
  baseline,
  autoBaseline = false,
  maxValue,
  stacked      = false,
  showGrid     = true,
  showLegend,
  ariaDesc,
}: AreaChartProps) {
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId  = `${chartId}-desc`;

  const safeWidth  = Math.max(0, width);
  const safeHeight = Math.max(0, height);

  const plotArea = {
    x:      PADDING.left,
    y:      PADDING.top,
    width:  Math.max(0, safeWidth - PADDING.left - PADDING.right),
    height: Math.max(0, safeHeight - PADDING.top - PADDING.bottom),
  };

  // dev mode 경고 — 알 수 없는 color 값
  if (process.env.NODE_ENV !== 'production') {
    series.forEach((s, idx) => {
      warnInvalidChartColor('AreaChart', s.color, `series[${idx}].`);
    });
  }

  // ─── 빈 데이터 placeholder ───
  const hasAnyData = series.some((s) => s.data.length > 0);
  if (!hasAnyData) {
    return (
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{ariaDesc ?? '데이터가 없는 빈 면적 차트'}</desc>
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

  const yDomain   = computeAreaDomain(series, baseline, autoBaseline, maxValue, stacked);
  const xValues   = collectXValues(series);
  const xAxisType = detectXAxisType(series);

  const numericMin = xAxisType === 'numeric' ? Math.min(...xValues.map((v) => Number(v))) : undefined;
  const numericMax = xAxisType === 'numeric' ? Math.max(...xValues.map((v) => Number(v))) : undefined;

  const yTicks = computeYTicks(yDomain, GRID_TICK_COUNT);
  const effectiveShowLegend = showLegend ?? series.length > 1;
  const desc = ariaDesc ?? generateAriaDesc(series, unit, stacked);

  // stacked 모드 누적값 사전 계산 (필요 시)
  const stackedTotals = stacked ? computeStackedValues(series, xValues) : null;

  // 누적 모드에서 직전 시리즈의 상단 좌표(다음 시리즈의 하단으로 사용)
  // 첫 시리즈는 baseline(yDomain.min)에서 시작
  let prevUpperCoords: { cx: number; cy: number }[] | null = null;

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

      {/* 범례 */}
      {effectiveShowLegend && (
        <Legend
          series={series}
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
        const y = plotArea.y + plotArea.height * (1 - (tick - yDomain.min) / (yDomain.max - yDomain.min));
        const isFloor = tick === yDomain.min;
        return (
          <g key={tick}>
            {showGrid && !isFloor && (
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

      {/* y축 제목 */}
      {yAxisLabel && (
        <text
          x={20}
          y={plotArea.y + plotArea.height / 2}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.label}
          fill={CHART_TOKENS.fills.header}
          transform={`rotate(-90 20 ${plotArea.y + plotArea.height / 2})`}
        >
          {yAxisLabel}
        </text>
      )}

      {/* x축 */}
      <line
        x1={plotArea.x}
        y1={plotArea.y + plotArea.height}
        x2={plotArea.x + plotArea.width}
        y2={plotArea.y + plotArea.height}
        stroke={CHART_TOKENS.fills.axis}
        strokeWidth={1}
      />
      {xValues.map((xv) => {
        const { cx } = mapPointToCoord(xv, yDomain.min, yDomain, plotArea, xAxisType, xValues, numericMin, numericMax);
        return (
          <text
            key={String(xv)}
            x={cx}
            y={plotArea.y + plotArea.height + 18}
            textAnchor="middle"
            fontSize={CHART_TOKENS.fontSize.subLabel}
            fill={CHART_TOKENS.fills.subLabel}
          >
            {String(xv)}
          </text>
        );
      })}

      {/* x축 제목 */}
      {xAxisLabel && (
        <text
          x={plotArea.x + plotArea.width / 2}
          y={safeHeight - 8}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.label}
          fill={CHART_TOKENS.fills.header}
        >
          {xAxisLabel}
        </text>
      )}

      {/* 면적 시리즈 */}
      {series.map((s, sIdx) => {
        if (s.data.length === 0) return null;
        const stroke = resolveAreaColor(s, sIdx, series.length);

        if (stacked && stackedTotals) {
          // stacked: 시리즈 상단 좌표 = (xValues, runningTotal[i])
          // 하단 좌표 = 직전 시리즈 상단 (없으면 baseline)
          const upperYs = stackedTotals.get(s.name) ?? [];
          const upperCoords = xValues.map((xv, i) =>
            mapPointToCoord(xv, upperYs[i], yDomain, plotArea, xAxisType, xValues, numericMin, numericMax),
          );
          const lowerCoords = prevUpperCoords
            ?? xValues.map((xv) =>
              mapPointToCoord(xv, yDomain.min, yDomain, plotArea, xAxisType, xValues, numericMin, numericMax),
            );

          const fillPath  = buildStackedAreaPath(upperCoords, lowerCoords);
          const linePath  = buildLinePath(upperCoords);
          prevUpperCoords = upperCoords;

          return (
            <g key={s.name}>
              <path d={fillPath} fill={stroke} fillOpacity={STACKED_OPACITY} stroke="none" />
              {upperCoords.length > 1 && (
                <path d={linePath} fill="none" stroke={stroke} strokeWidth={LINE_STROKE_WIDTH} />
              )}
            </g>
          );
        }

        // 비누적: baseline까지 닫힌 면적
        const points = s.data.map((p) =>
          mapPointToCoord(p.x, p.y, yDomain, plotArea, xAxisType, xValues, numericMin, numericMax),
        );
        const linePath  = buildLinePath(points);
        const baselineY = plotArea.y + plotArea.height;
        const fillPath  = buildAreaPath(points, baselineY);

        return (
          <g key={s.name}>
            {points.length > 1 && (
              <path d={fillPath} fill={stroke} fillOpacity={FILL_OPACITY} stroke="none" />
            )}
            {points.length > 1 && (
              <path d={linePath} fill="none" stroke={stroke} strokeWidth={LINE_STROKE_WIDTH} />
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

function Legend({ series, x, y }: { series: AreaSeries[]; x: number; y: number }) {
  // 우측 정렬: x는 우측 끝, 시리즈를 끝에서부터 역순으로 배치
  let cursor = x;
  const items = series.map((s, i) => ({
    name:  s.name,
    color: resolveAreaColor(s, i, series.length),
  }));

  const elements: Array<{ name: string; color: string; xAnchor: number }> = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const estW = estimateTextWidth(item.name) + LEGEND_DOT_SIZE + 6;
    cursor -= estW;
    elements.unshift({ ...item, xAnchor: cursor });
    cursor -= LEGEND_ITEM_GAP;
  }

  return (
    <g>
      {elements.map((el) => (
        <g key={el.name}>
          <rect x={el.xAnchor} y={y - 6} width={LEGEND_DOT_SIZE} height={LEGEND_DOT_SIZE} fill={el.color} />
          <text
            x={el.xAnchor + LEGEND_DOT_SIZE + 4}
            y={y + 4}
            fontSize={CHART_TOKENS.fontSize.subLabel}
            fill={CHART_TOKENS.fills.header}
          >
            {el.name}
          </text>
        </g>
      ))}
    </g>
  );
}

export type { AreaSeries, AreaPoint, AreaColor, XValue } from './AreaChart.utils';
