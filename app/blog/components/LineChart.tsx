/**
 * LineChart — 시계열 추세, 다중 시리즈, baseline·maxValue 지원
 *
 * 사이클 N 신규 컴포넌트. HorizontalBarChart 패턴 일관성 유지:
 * - 자체 SVG (Recharts·d3 미사용)
 * - 5색 키워드 + gradient (lib/chart-colors)
 * - system-ui 폰트 + 디자인 토큰 (lib/chart-tokens)
 * - viewBox 100% width 반응형
 * - 접근성: <title>, <desc>, role="img"
 *
 * 데이터-잉크 비율: 가로 그리드만(세로 그리드 X), 점 4px, 선 2px.
 */

'use client';

import { useId } from 'react';
import { CHART_COLORS, getGradientFill, type ColorKey } from '@/lib/chart-colors';
import { CHART_TOKENS } from '@/lib/chart-tokens';
import {
  buildAreaPath,
  buildLinePath,
  collectXValues,
  computeAxisDomain,
  computeYTicks,
  detectXAxisType,
  generateAriaDesc,
  isPointClipped,
  mapPointToCoord,
  resolveSeriesColor,
  type LineSeries,
  type XValue,
} from './LineChart.utils';

interface LineChartProps {
  title:        string;
  series:       LineSeries[];
  unit?:        string;
  xAxisLabel?:  string;
  yAxisLabel?:  string;
  width?:       number;
  height?:      number;
  baseline?:    number;
  autoBaseline?: boolean;
  maxValue?:    number;
  autoScale?:   boolean;
  showGrid?:    boolean;
  showLegend?:  boolean;
  showDots?:    boolean;
  /** value 절대값 기반 점 색상 (선은 시리즈 색상). default false */
  gradientDots?: boolean;
  ariaDesc?:    string;
  /** color 미지정 시리즈에 대한 fallback colorMode. 현재는 series 모드만 지원. */
  colorMode?:   'discrete' | 'gradient';
}

const PADDING = {
  top:    60,
  right:  24,
  bottom: 56,
  left:   60,
} as const;

const DOT_RADIUS         = 4;
const LINE_STROKE_WIDTH  = 2;
const FILL_OPACITY       = 0.15;
const GRID_TICK_COUNT    = 5;
const LEGEND_ITEM_GAP    = 16;
const LEGEND_DOT_SIZE    = 10;
const DASH_PATTERN       = '6 4';
const CLIPPED_INDICATOR_SIZE = 10;

export function LineChart({
  title,
  series,
  unit          = '%',
  xAxisLabel,
  yAxisLabel,
  width         = 640,
  height        = 360,
  baseline,
  autoBaseline  = false,
  maxValue,
  autoScale: _autoScale,
  showGrid      = true,
  showLegend,
  showDots      = true,
  gradientDots  = false,
  ariaDesc,
  colorMode: _colorMode = 'discrete',
}: LineChartProps) {
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

  // ─── 빈 데이터 처리 (placeholder) ───
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
        <desc id={descId}>{ariaDesc ?? '데이터가 없는 빈 차트'}</desc>
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

  const yDomain   = computeAxisDomain(series, baseline, autoBaseline, maxValue);
  const xValues   = collectXValues(series);
  const xAxisType = detectXAxisType(series);

  const numericMin = xAxisType === 'numeric' ? Math.min(...xValues.map((v) => Number(v))) : undefined;
  const numericMax = xAxisType === 'numeric' ? Math.max(...xValues.map((v) => Number(v))) : undefined;

  const yTicks = computeYTicks(yDomain, GRID_TICK_COUNT);

  // legend default: 다중 시리즈일 때만 자동 표시
  const effectiveShowLegend = showLegend ?? series.length > 1;

  const desc = ariaDesc ?? generateAriaDesc(series, unit);

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

      {/* 시리즈 (filled 영역 먼저, 그 위에 선 + 점) */}
      {series.map((s, sIdx) => {
        if (s.data.length === 0) return null;
        const colorKey = resolveSeriesColor(s, sIdx, series.length);
        const stroke   = CHART_COLORS[colorKey];

        const points = s.data.map((p) =>
          mapPointToCoord(p.x, p.y, yDomain, plotArea, xAxisType, xValues, numericMin, numericMax),
        );
        const linePath = buildLinePath(points);
        const baselineY = plotArea.y + plotArea.height; // y축 baseline 위치

        return (
          <g key={s.name}>
            {s.filled && points.length > 1 && (
              <path
                d={buildAreaPath(points, baselineY)}
                fill={stroke}
                fillOpacity={FILL_OPACITY}
                stroke="none"
              />
            )}
            {points.length > 1 && (
              <path
                d={linePath}
                fill="none"
                stroke={stroke}
                strokeWidth={LINE_STROKE_WIDTH}
                strokeDasharray={s.dashed ? DASH_PATTERN : undefined}
              />
            )}
            {showDots &&
              points.map((p, pIdx) => {
                const yVal = s.data[pIdx].y;
                const dotFill = gradientDots ? getGradientFill(yVal) : stroke;
                const clip = isPointClipped(yVal, yDomain, maxValue);
                if (clip.clipped && clip.direction === 'up') {
                  return (
                    <ClippedMarker
                      key={`${s.name}-${pIdx}`}
                      cx={p.cx}
                      cy={plotArea.y + 2}
                      direction="up"
                      fill={stroke}
                    />
                  );
                }
                return (
                  <circle
                    key={`${s.name}-${pIdx}`}
                    cx={p.cx}
                    cy={p.cy}
                    r={DOT_RADIUS}
                    fill={dotFill}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                );
              })}
          </g>
        );
      })}
    </svg>
  );
}

function formatTick(value: number, unit: string): string {
  // 정수면 정수로, 소수면 1자리
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}${unit}`;
}

function Legend({ series, x, y }: { series: LineSeries[]; x: number; y: number }) {
  // 우측 정렬: x는 우측 끝, 시리즈를 끝에서부터 역순으로 배치
  let cursor = x;
  const items = series.map((s, i) => {
    const colorKey = resolveSeriesColor(s, i, series.length);
    return { name: s.name, color: CHART_COLORS[colorKey], dashed: s.dashed };
  });

  // 단순화: 우측에서 좌측으로 누적 배치 (시리즈명 길이 추정)
  const elements: Array<{ name: string; color: string; dashed?: boolean; xAnchor: number }> = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const estW = item.name.length * 7 + LEGEND_DOT_SIZE + 6;
    cursor -= estW;
    elements.unshift({ ...item, xAnchor: cursor });
    cursor -= LEGEND_ITEM_GAP;
  }

  return (
    <g>
      {elements.map((el) => (
        <g key={el.name}>
          <line
            x1={el.xAnchor}
            y1={y}
            x2={el.xAnchor + LEGEND_DOT_SIZE}
            y2={y}
            stroke={el.color}
            strokeWidth={LINE_STROKE_WIDTH}
            strokeDasharray={el.dashed ? DASH_PATTERN : undefined}
          />
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

function ClippedMarker({
  cx,
  cy,
  direction,
  fill,
}: {
  cx: number;
  cy: number;
  direction: 'up' | 'down';
  fill: string;
}) {
  const half = CLIPPED_INDICATOR_SIZE / 2;
  const points = direction === 'up'
    ? `${cx},${cy} ${cx - half},${cy + half} ${cx + half},${cy + half}`
    : `${cx},${cy} ${cx - half},${cy - half} ${cx + half},${cy - half}`;
  return <polygon points={points} fill={fill} />;
}

export type { LineSeries, LinePoint, XValue } from './LineChart.utils';
