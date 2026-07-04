/**
 * 좌우 대비 가로막대 차트 — 거주지·출신지 같은 카테고리별 1차/2차 비교
 *
 * 디자인 기준: kb-report SVG #4 (강남3구 매수자 거주지 변화)
 * - viewBox 640×380
 * - 좌측 박스 x=40 시작, 우측 박스 x=480 시작 (오른쪽 정렬)
 * - 박스 width = value × 2.78 (예: 43.1 → 120, 39.6 → 110)
 * - 박스 height 40, 행 간격 80px
 * - 가운데 화살표 → x=320 y=180
 * - 우측 박스 옆 변화 마커 ▼▲─ x=600
 *
 * 사이클 S Step S-2: 자체 COLORS 제거 → lib/chart-colors.CHART_COLORS 통합.
 * 키워드 'orange'는 4개 차트의 #E8663C와 톤이 달라(#F0A24B) 'amberOrange'로 명시 분리.
 */

import { CHART_COLORS } from '@/lib/chart-colors';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';

const TEXT_ON_LIGHT = '#14213D'; // yellow 박스 위 텍스트
const TEXT_ON_DARK = '#ffffff'; // amberOrange/red 박스 위 텍스트
const SUB_LABEL_FILL = '#64708A';
const HEADER_FILL = '#374151';
const ARROW_FILL = '#9AA4B8';
const DELTA_UP_DOWN_FILL = '#E23B3B';
const DELTA_FLAT_FILL = '#64708A';

const SCALE = 2.78; // value × SCALE = bar width (default — 0~100 비율 기준)
/**
 * Phase 8-3: 자동 정규화 임계.
 *
 * 100 × SCALE = 278px (좌측 박스 영역 안전 폭).
 * dataMax × SCALE이 이 폭을 초과하면 effectiveScale을 자동 축소해
 * 큰 절댓값(예: 200, 500)이 와도 막대가 viewBox를 벗어나지 않게 한다.
 *
 * 회귀 0: dataMax <= 100인 데이터는 effectiveScale === SCALE로 기존 동작 그대로.
 */
const MAX_BAR_WIDTH = 278;
const BOX_HEIGHT = 40;
const ROW_PITCH = 80; // y 120, 200, 280
const LEFT_X = 40;
const RIGHT_X_END = 590; // 우측 박스 right edge (x + width = 590 max)
const ARROW_X = 320;
const DELTA_X = 600;

/**
 * categories 전체에서 절댓값 최대를 구하고, 정규화 필요 여부를 판단해 effectiveScale 반환.
 * - 빈 배열 또는 모두 0 → SCALE 그대로 (분모 0 회피)
 * - dataMax × SCALE ≤ MAX_BAR_WIDTH → SCALE 그대로 (회귀 0)
 * - 그 외 → MAX_BAR_WIDTH / dataMax (자동 축소)
 */
function computeEffectiveScale(categories: CategoryRow[]): number {
  if (categories.length === 0) return SCALE;
  const allValues = categories.flatMap((c) => [
    Math.abs(c.leftValue),
    Math.abs(c.rightValue),
  ]);
  const dataMax = Math.max(...allValues);
  if (dataMax <= 0) return SCALE;
  return dataMax * SCALE > MAX_BAR_WIDTH ? MAX_BAR_WIDTH / dataMax : SCALE;
}

interface CategoryRow {
  label: string;
  leftValue: number;
  rightValue: number;
  /** DemographicShiftBars 전용 3색. amber 톤 'amberOrange'(#F0A24B)는 표준 'orange'(#E8663C)와 구분. */
  color: 'yellow' | 'amberOrange' | 'red';
}

interface DemographicShiftBarsProps {
  title: string;
  leftHeader: { label: string; subLabel: string };
  rightHeader: { label: string; subLabel: string };
  categories: CategoryRow[];
  caption?: string;
}

function getDeltaMark(left: number, right: number): { text: string; fill: string } {
  if (right > left) return { text: '▲', fill: DELTA_UP_DOWN_FILL };
  if (right < left) return { text: '▼', fill: DELTA_UP_DOWN_FILL };
  return { text: '─', fill: DELTA_FLAT_FILL };
}

export function DemographicShiftBars({
  title,
  leftHeader,
  rightHeader,
  categories,
  caption,
}: DemographicShiftBarsProps) {
  // Phase 8-1: 비정상 입력 방어
  if (!Array.isArray(categories)) {
    return <ChartErrorPlaceholder chartName="DemographicShiftBars" reason="categories prop이 배열이 아닙니다" width={640} height={380} />;
  }

  // Phase 8-3: 큰 절댓값 자동 정규화. 0~100 데이터는 SCALE 그대로 (회귀 0).
  const effectiveScale = computeEffectiveScale(categories);

  const height = caption ? 410 : 380;

  return (
    <svg
      viewBox={`0 0 640 ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: '100%',
        height: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 제목 */}
      <text
        x={320}
        y={24}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        fill="#14213D"
      >
        {title}
      </text>

      {/* 좌측 헤더 */}
      <text x={100} y={80} textAnchor="middle" fontSize={12} fill={HEADER_FILL} fontWeight={600}>
        {leftHeader.label}
      </text>
      <text x={100} y={98} textAnchor="middle" fontSize={10} fill={SUB_LABEL_FILL}>
        {leftHeader.subLabel}
      </text>

      {/* 우측 헤더 */}
      <text x={540} y={80} textAnchor="middle" fontSize={12} fill={HEADER_FILL} fontWeight={600}>
        {rightHeader.label}
      </text>
      <text x={540} y={98} textAnchor="middle" fontSize={10} fill={SUB_LABEL_FILL}>
        {rightHeader.subLabel}
      </text>

      {/* 카테고리 행 */}
      {categories.map((row, i) => {
        const yRect = 120 + i * ROW_PITCH;
        // Math.max(0, ...): 음수 값이 들어와도 막대 폭은 0 클램프 (SVG width 음수 방지)
        const leftWidth = Math.max(0, row.leftValue * effectiveScale);
        const rightWidth = Math.max(0, row.rightValue * effectiveScale);
        const rightBoxX = RIGHT_X_END - rightWidth - 2; // 우측 박스 오른쪽 기준
        const leftBoxFill = CHART_COLORS[row.color];
        const textOnLeft = row.color === 'yellow' ? TEXT_ON_LIGHT : TEXT_ON_DARK;
        const textOnRight = row.color === 'yellow' ? TEXT_ON_LIGHT : TEXT_ON_DARK;
        const delta = getDeltaMark(row.leftValue, row.rightValue);

        return (
          <g key={`${row.label}-${i}`}>
            {/* 좌측 박스 */}
            <rect x={LEFT_X} y={yRect} width={leftWidth} height={BOX_HEIGHT} fill={leftBoxFill} />
            <text
              x={LEFT_X + leftWidth / 2}
              y={yRect + 25}
              textAnchor="middle"
              fontSize={14}
              fontWeight={600}
              fill={textOnLeft}
            >
              {row.leftValue.toFixed(1)}%
            </text>
            <text
              x={100}
              y={yRect + BOX_HEIGHT + 18}
              textAnchor="middle"
              fontSize={11}
              fill={SUB_LABEL_FILL}
            >
              {row.label}
            </text>

            {/* 우측 박스 */}
            <rect x={rightBoxX} y={yRect} width={rightWidth} height={BOX_HEIGHT} fill={leftBoxFill} />
            <text
              x={rightBoxX + rightWidth / 2}
              y={yRect + 25}
              textAnchor="middle"
              fontSize={14}
              fontWeight={600}
              fill={textOnRight}
            >
              {row.rightValue.toFixed(1)}%
            </text>
            <text
              x={540}
              y={yRect + BOX_HEIGHT + 18}
              textAnchor="middle"
              fontSize={11}
              fill={SUB_LABEL_FILL}
            >
              {row.label}
            </text>

            {/* 변화 마커 (▲/▼/─) */}
            <text
              x={DELTA_X}
              y={yRect + 25}
              textAnchor="start"
              fontSize={11}
              fontWeight={600}
              fill={delta.fill}
            >
              {delta.text}
            </text>
          </g>
        );
      })}

      {/* 가운데 화살표 (위치는 가운데 카테고리 기준) */}
      <text x={ARROW_X} y={120 + ROW_PITCH + BOX_HEIGHT / 2 + 5} textAnchor="middle" fontSize={20} fill={ARROW_FILL}>
        →
      </text>

      {/* caption */}
      {caption && (
        <text x={320} y={height - 10} textAnchor="middle" fontSize={11} fill={SUB_LABEL_FILL}>
          {caption}
        </text>
      )}
    </svg>
  );
}
