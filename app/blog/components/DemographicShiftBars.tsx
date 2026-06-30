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
 * 키워드 'orange'는 4개 차트의 #ea580c와 톤이 달라(#f97316) 'amberOrange'로 명시 분리.
 */

import { CHART_COLORS } from '@/lib/chart-colors';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';

const TEXT_ON_LIGHT = '#111827'; // yellow 박스 위 텍스트
const TEXT_ON_DARK = '#ffffff'; // amberOrange/red 박스 위 텍스트
const SUB_LABEL_FILL = '#6b7280';
const HEADER_FILL = '#374151';
const ARROW_FILL = '#9ca3af';
const DELTA_UP_DOWN_FILL = '#dc2626';
const DELTA_FLAT_FILL = '#6b7280';

const SCALE = 2.78; // value × SCALE = bar width
const BOX_HEIGHT = 40;
const ROW_PITCH = 80; // y 120, 200, 280
const LEFT_X = 40;
const RIGHT_X_END = 590; // 우측 박스 right edge (x + width = 590 max)
const ARROW_X = 320;
const DELTA_X = 600;

interface CategoryRow {
  label: string;
  leftValue: number;
  rightValue: number;
  /** DemographicShiftBars 전용 3색. amber 톤 'amberOrange'(#f97316)는 표준 'orange'(#ea580c)와 구분. */
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
        fill="#111827"
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
        const leftWidth = row.leftValue * SCALE;
        const rightWidth = row.rightValue * SCALE;
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
