/**
 * HeatMap — 2D 격자 히트맵. 셀 값을 연속 색 농도로.
 *
 * 사이클 O Phase 2 신규 컴포넌트.
 * 부동산 사용 예: 지역×기간 변동률, 평형×층 시세 분포.
 *
 * 색상 시스템 특수:
 * - 이산 color 입력 prop 없음 (intent 개념 약함)
 * - getGradientFill(value) 직접 매핑 (양수 8단계 + 음수 5단계)
 * - colorScale prop으로 커스텀 색상 함수 override 가능
 * - null 셀은 회색 (데이터 없음 표시)
 */

'use client';

import { useId } from 'react';
import { CHART_TOKENS } from '@/lib/chart-tokens';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';
import {
  computeCellLayout,
  formatCellValue,
  generateAriaDesc,
  resolveCellColor,
  resolveCellTextColor,
} from './HeatMap.utils';

interface HeatMapProps {
  title:       string;
  rows:        string[];
  cols:        string[];
  values:      (number | null)[][];
  unit?:       string;
  width?:      number;
  height?:     number;
  showValues?: boolean;
  cellGap?:    number;
  ariaDesc?:   string;
  /** 커스텀 색상 함수. 미지정 시 getGradientFill 사용. */
  colorScale?: (value: number) => string;
}

const PADDING = {
  top:    60,    // 제목 + col 라벨
  right:  16,
  bottom: 32,
  left:   80,    // row 라벨 영역
} as const;

const COL_LABEL_OFFSET = 12;   // plotArea 위쪽에 col 라벨 배치
const ROW_LABEL_OFFSET = 8;    // plotArea 왼쪽에서 row 라벨 우측 정렬
const DEFAULT_HEIGHT_PER_ROW = 40;

export function HeatMap({
  title,
  rows,
  cols,
  values,
  unit       = '%',
  width      = 640,
  height,
  showValues = true,
  cellGap    = 2,
  ariaDesc,
  colorScale,
}: HeatMapProps) {
  // React Hooks 규칙: hook은 early return 전
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId  = `${chartId}-desc`;

  // Phase 8-1: 비정상 입력 방어 — rows/cols/values 중 하나라도 배열 아니면 placeholder
  if (!Array.isArray(rows) || !Array.isArray(cols) || !Array.isArray(values)) {
    return <ChartErrorPlaceholder chartName="HeatMap" reason="rows/cols/values 중 배열이 아닌 prop이 있습니다" width={width} height={height} />;
  }

  const safeWidth  = Math.max(0, width);
  // height 미지정 시 행 수 기반 동적 계산
  const safeHeight = Math.max(
    0,
    height ?? PADDING.top + PADDING.bottom + Math.max(1, rows.length) * DEFAULT_HEIGHT_PER_ROW,
  );

  const plotArea = {
    x:      PADDING.left,
    y:      PADDING.top,
    width:  Math.max(0, safeWidth - PADDING.left - PADDING.right),
    height: Math.max(0, safeHeight - PADDING.top - PADDING.bottom),
  };

  const desc = ariaDesc ?? generateAriaDesc(rows, cols, values, unit);

  // ─── 빈 격자 placeholder ───
  if (rows.length === 0 || cols.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{ariaDesc ?? '데이터가 없는 빈 히트맵'}</desc>
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

  const layout = computeCellLayout(rows, cols, plotArea, cellGap);

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

      {/* 열 라벨 (상단) */}
      {cols.map((col, c) => {
        const { x } = layout.cellAt(0, c);
        return (
          <text
            key={`col-${c}`}
            x={x + layout.cellWidth / 2}
            y={plotArea.y - COL_LABEL_OFFSET}
            textAnchor="middle"
            fontSize={CHART_TOKENS.fontSize.subLabel}
            fill={CHART_TOKENS.fills.header}
          >
            {col}
          </text>
        );
      })}

      {/* 행 라벨 (좌측) */}
      {rows.map((row, r) => {
        const { y } = layout.cellAt(r, 0);
        return (
          <text
            key={`row-${r}`}
            x={plotArea.x - ROW_LABEL_OFFSET}
            y={y + layout.cellHeight / 2 + 4}
            textAnchor="end"
            fontSize={CHART_TOKENS.fontSize.subLabel}
            fill={CHART_TOKENS.fills.header}
          >
            {row}
          </text>
        );
      })}

      {/* 셀 격자 */}
      {rows.map((_, r) =>
        cols.map((__, c) => {
          const value = values[r]?.[c] ?? null;
          const { x, y } = layout.cellAt(r, c);
          const fill = resolveCellColor(value, colorScale);
          const textColor = resolveCellTextColor(fill);
          const text = formatCellValue(value, unit);

          return (
            <g key={`cell-${r}-${c}`}>
              <rect
                x={x}
                y={y}
                width={layout.cellWidth}
                height={layout.cellHeight}
                fill={fill}
              />
              {showValues && text && (
                <text
                  x={x + layout.cellWidth / 2}
                  y={y + layout.cellHeight / 2 + 4}
                  textAnchor="middle"
                  fontSize={CHART_TOKENS.fontSize.micro}
                  fill={textColor}
                  fontWeight={600}
                >
                  {text}
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}

export type { PlotArea, CellLayout } from './HeatMap.utils';
