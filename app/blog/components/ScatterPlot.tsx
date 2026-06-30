/**
 * ScatterPlot — x·y 수치 상관 산점도. 그룹별 색상.
 *
 * 사이클 O Phase 1 신규 컴포넌트. LineChart 골든 템플릿 따름:
 * - 자체 SVG (Recharts·d3 미사용)
 * - lib/chart-colors, lib/chart-tokens 재사용
 * - viewBox 100% width 반응형
 * - 접근성: <title>, <desc>, role="img"
 *
 * intent='category' — 단일 그룹 fallback 없음. index 0 = red.
 * 점 label은 단순 렌더(충돌 회피 미적용 — 별도 백로그).
 */

'use client';

import { useId } from 'react';
import { warnInvalidChartColor } from '@/lib/chart-colors';
import { CHART_TOKENS, estimateTextWidth } from '@/lib/chart-tokens';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';
import {
  computeScatterDomain,
  computeXTicks,
  computeYTicks,
  generateAriaDesc,
  mapDotToCoord,
  resolveGroupColor,
  type ScatterGroup,
} from './ScatterPlot.utils';

interface ScatterPlotProps {
  title:       string;
  groups:      ScatterGroup[];
  xUnit?:      string;
  yUnit?:      string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  width?:      number;
  height?:     number;
  xMin?:       number;
  xMax?:       number;
  yMin?:       number;
  yMax?:       number;
  showGrid?:   boolean;
  showLegend?: boolean;
  dotRadius?:  number;
  ariaDesc?:   string;
}

const PADDING = {
  top:    60,
  right:  24,
  bottom: 56,
  left:   60,
} as const;

const GRID_TICK_COUNT = 5;
const LEGEND_ITEM_GAP = 16;
const LEGEND_DOT_SIZE = 10;
const DOT_LABEL_OFFSET = 8; // 점 옆 라벨 간격

export function ScatterPlot({
  title,
  groups,
  xUnit       = '',
  yUnit       = '',
  xAxisLabel,
  yAxisLabel,
  width       = 640,
  height      = 400,
  xMin,
  xMax,
  yMin,
  yMax,
  showGrid    = true,
  showLegend,
  dotRadius   = 5,
  ariaDesc,
}: ScatterPlotProps) {
  // React Hooks 규칙: hook은 early return 전
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId  = `${chartId}-desc`;

  // Phase 8-1: 비정상 입력 방어
  if (!Array.isArray(groups)) {
    return <ChartErrorPlaceholder chartName="ScatterPlot" reason="groups prop이 배열이 아닙니다" width={width} height={height} />;
  }
  if (groups.some((g) => !Array.isArray(g?.dots))) {
    return <ChartErrorPlaceholder chartName="ScatterPlot" reason="groups[].dots가 배열이 아닙니다" width={width} height={height} />;
  }

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
    groups.forEach((g, idx) => {
      warnInvalidChartColor('ScatterPlot', g.color, `groups[${idx}].`);
    });
  }

  // ─── 빈 데이터 placeholder ───
  const totalDots = groups.reduce((acc, g) => acc + g.dots.length, 0);
  if (totalDots === 0) {
    return (
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{ariaDesc ?? '데이터가 없는 빈 산점도'}</desc>
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

  const xDomain = computeScatterDomain(groups, 'x', xMin, xMax);
  const yDomain = computeScatterDomain(groups, 'y', yMin, yMax);
  const xTicks  = computeXTicks(xDomain, GRID_TICK_COUNT);
  const yTicks  = computeYTicks(yDomain, GRID_TICK_COUNT);

  const effectiveShowLegend = showLegend ?? groups.length > 1;
  const desc = ariaDesc ?? generateAriaDesc(groups, xUnit, yUnit);

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
        <Legend groups={groups} x={safeWidth - PADDING.right} y={44} />
      )}

      {/* y축 + 가로 그리드 */}
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
          <g key={`y-${tick}`}>
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
              {formatTick(tick, yUnit)}
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

      {/* x축 + 세로 그리드 */}
      <line
        x1={plotArea.x}
        y1={plotArea.y + plotArea.height}
        x2={plotArea.x + plotArea.width}
        y2={plotArea.y + plotArea.height}
        stroke={CHART_TOKENS.fills.axis}
        strokeWidth={1}
      />
      {xTicks.map((tick) => {
        const x = plotArea.x + (plotArea.width * (tick - xDomain.min)) / (xDomain.max - xDomain.min);
        const isStart = tick === xDomain.min;
        return (
          <g key={`x-${tick}`}>
            {showGrid && !isStart && (
              <line
                x1={x}
                y1={plotArea.y}
                x2={x}
                y2={plotArea.y + plotArea.height}
                stroke={CHART_TOKENS.fills.grid}
                strokeWidth={0.5}
                strokeDasharray="3 3"
              />
            )}
            <text
              x={x}
              y={plotArea.y + plotArea.height + 18}
              textAnchor="middle"
              fontSize={CHART_TOKENS.fontSize.subLabel}
              fill={CHART_TOKENS.fills.subLabel}
            >
              {formatTick(tick, xUnit)}
            </text>
          </g>
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

      {/* 그룹별 점 + 라벨 */}
      {groups.map((g, gIdx) => {
        const fill = resolveGroupColor(g, gIdx);
        return (
          <g key={g.name}>
            {g.dots.map((d, dIdx) => {
              const { cx, cy } = mapDotToCoord(d, xDomain, yDomain, plotArea);
              return (
                <g key={`${g.name}-${dIdx}`}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={dotRadius}
                    fill={fill}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                  {d.label && (
                    <text
                      x={cx + dotRadius + DOT_LABEL_OFFSET}
                      y={cy + 4}
                      fontSize={CHART_TOKENS.fontSize.subLabel}
                      fill={CHART_TOKENS.fills.header}
                    >
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
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

function Legend({ groups, x, y }: { groups: ScatterGroup[]; x: number; y: number }) {
  // 우측 정렬: x는 우측 끝, 그룹을 끝에서부터 역순으로 배치
  let cursor = x;
  const items = groups.map((g, i) => ({
    name:  g.name,
    color: resolveGroupColor(g, i),
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
          <circle cx={el.xAnchor + LEGEND_DOT_SIZE / 2} cy={y} r={LEGEND_DOT_SIZE / 2} fill={el.color} />
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

export type { ScatterGroup, ScatterDot, ScatterColor } from './ScatterPlot.utils';
