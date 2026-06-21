/**
 * HeatMap 순수 함수 모듈 — 사이클 O Phase 2.
 *
 * 2D 격자 히트맵. 셀 값을 연속 색 농도로 표현.
 * - 이산 색상 시스템(resolveChartColor) 사용 안 함
 * - getGradientFill(value) 직접 매핑 (HorizontalBarChart gradient와 동일)
 * - null 셀은 회색 표시 (데이터 없음)
 * - colorScale override로 커스텀 색상 함수 주입 가능
 */

import { getGradientFill, getGradientTextFill } from '@/lib/chart-colors';
import { CHART_TOKENS } from '@/lib/chart-tokens';

/** null 셀 회색 — CHART_TOKENS.fills.grid와 동일. 의미 분리 위해 상수화. */
export const NULL_CELL_FILL = CHART_TOKENS.fills.grid;

export interface PlotArea {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface CellLayout {
  cellWidth:  number;
  cellHeight: number;
  cellAt:     (rowIdx: number, colIdx: number) => { x: number; y: number };
}

/**
 * 격자 셀 좌표·크기 계산.
 *
 * 셀 너비/높이는 plotArea를 (행·열 수) × (셀크기 + cellGap × (n-1))로 균등 분할.
 * 빈 행/열 → 셀크기 0 (placeholder는 호출부에서 별도 처리).
 */
export function computeCellLayout(
  rows: string[],
  cols: string[],
  plotArea: PlotArea,
  cellGap: number,
): CellLayout {
  const rowCount = rows.length;
  const colCount = cols.length;

  const cellWidth = colCount > 0
    ? Math.max(0, (plotArea.width - cellGap * (colCount - 1)) / colCount)
    : 0;
  const cellHeight = rowCount > 0
    ? Math.max(0, (plotArea.height - cellGap * (rowCount - 1)) / rowCount)
    : 0;

  return {
    cellWidth,
    cellHeight,
    cellAt: (r, c) => ({
      x: plotArea.x + c * (cellWidth + cellGap),
      y: plotArea.y + r * (cellHeight + cellGap),
    }),
  };
}

/**
 * 셀 색상 결정.
 *   1. null → 회색 (데이터 없음)
 *   2. colorScale 명시 → 사용자 함수 결과
 *   3. default → getGradientFill (양수 8단계 + 음수 5단계)
 */
export function resolveCellColor(
  value: number | null,
  colorScale?: (value: number) => string,
): string {
  if (value === null) return NULL_CELL_FILL;
  if (colorScale) return colorScale(value);
  return getGradientFill(value);
}

/**
 * 셀 위 텍스트 색상.
 * - null 셀(회색) → subLabel(어두운 회색) 대비 확보
 * - 그 외 → getGradientTextFill (옅은 cream 셀은 진한 갈색)
 */
export function resolveCellTextColor(cellFill: string): string {
  if (cellFill === NULL_CELL_FILL) return CHART_TOKENS.fills.subLabel;
  return getGradientTextFill(cellFill);
}

/** null 제외 min/max. 전체 null/빈 → { min: 0, max: 0 }. */
export function computeValueRange(values: (number | null)[][]): { min: number; max: number } {
  const flat: number[] = [];
  for (const row of values) {
    for (const v of row) {
      if (v !== null) flat.push(v);
    }
  }
  if (flat.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...flat), max: Math.max(...flat) };
}

/** 셀 값 포맷. null → '', 정수 그대로, 그 외 소수점 1자리. */
export function formatCellValue(value: number | null, unit: string): string {
  if (value === null) return '';
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${formatted}${unit}`;
}

/** ariaDesc 자동 생성 — 격자 크기 + 값 범위 요약. */
export function generateAriaDesc(
  rows: string[],
  cols: string[],
  values: (number | null)[][],
  unit: string,
): string {
  if (rows.length === 0 || cols.length === 0) return '데이터가 없는 빈 히트맵';
  const { min, max } = computeValueRange(values);
  const nullCount = values.flat().filter((v) => v === null).length;
  const totalCells = rows.length * cols.length;

  const rangeText = min === 0 && max === 0
    ? '데이터 없음'
    : `값 범위 ${min.toFixed(1)}${unit} ~ ${max.toFixed(1)}${unit}`;
  const nullText = nullCount > 0 ? ` (null 셀 ${nullCount}/${totalCells}개)` : '';

  return `${rows.length}행 × ${cols.length}열 히트맵. ${rangeText}${nullText}.`;
}
