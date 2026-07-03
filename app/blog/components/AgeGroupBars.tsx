/**
 * 그룹 막대 차트 — 연령·세그먼트별 before/after 비교 (세로 막대)
 *
 * 디자인 기준: kb-report SVG #5 (1차 vs 2차 상승기 매수자 연령별 비중)
 * - viewBox 640×360
 * - X축 80~600 (520px), Y축 60~280 (220px = yMax%)
 * - 1% = 5.5px (yMax=40 기준)
 * - 그룹폭 90, 막대폭 40, 그룹 간격 60
 * - before #9AA4B8 slate, after #E23B3B red
 * - 그리드 점선 4단계 (10/20/30/40%)
 * - 값 라벨 위쪽 (y_rect - 7)
 * - 그룹 라벨 y=300, 변화 마커 y=315
 * - 범례 y=335
 */

import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';

const BEFORE_FILL = '#9AA4B8';
const AFTER_FILL = '#E23B3B';
const AXIS_FILL = '#9AA4B8';
const GRID_FILL = '#e5e7eb';
const TEXT_FILL = '#374151';
const SUB_LABEL_FILL = '#64708A';

const VIEW_WIDTH = 640;
const X_START = 80;
const X_END = 600;
const Y_TOP = 60;
const Y_AXIS_BOTTOM = 280;
const PLOT_HEIGHT = Y_AXIS_BOTTOM - Y_TOP; // 220
const BAR_WIDTH = 40;
const BAR_GAP = 10; // 막대 사이 (before-after)
const GROUP_PITCH = 150; // 그룹 간 거리

interface AgeGroup {
  label: string;
  beforeValue: number;
  afterValue: number;
  delta?: { text: string; type: 'up' | 'down' };
}

interface AgeGroupBarsProps {
  title: string;
  beforeLabel: string;
  afterLabel: string;
  yMax?: number;
  groups: AgeGroup[];
}

export function AgeGroupBars({
  title,
  beforeLabel,
  afterLabel,
  yMax = 40,
  groups,
}: AgeGroupBarsProps) {
  // Phase 8-1: 비정상 입력 방어
  if (!Array.isArray(groups)) {
    return <ChartErrorPlaceholder chartName="AgeGroupBars" reason="groups prop이 배열이 아닙니다" width={VIEW_WIDTH} height={360} />;
  }

  const pxPerPercent = PLOT_HEIGHT / yMax; // 5.5 (yMax=40 기준)
  const yLabelStep = yMax / 4; // 10
  const yLabels = [0, yLabelStep, yLabelStep * 2, yLabelStep * 3, yMax];

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} 360`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: '100%',
        height: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 제목 */}
      <text x={VIEW_WIDTH / 2} y={24} textAnchor="middle" fontSize={14} fontWeight={600} fill="#14213D">
        {title}
      </text>

      {/* 축 */}
      <line x1={X_START} y1={Y_AXIS_BOTTOM} x2={X_END} y2={Y_AXIS_BOTTOM} stroke={AXIS_FILL} strokeWidth={1} />
      <line x1={X_START} y1={Y_TOP} x2={X_START} y2={Y_AXIS_BOTTOM} stroke={AXIS_FILL} strokeWidth={1} />

      {/* Y축 라벨 + 그리드 */}
      {yLabels.map((label) => {
        const y = Y_AXIS_BOTTOM - label * pxPerPercent;
        return (
          <g key={label}>
            <text x={X_START - 20} y={y + 5} textAnchor="end" fontSize={10} fill={SUB_LABEL_FILL}>
              {label}%
            </text>
            {label > 0 && (
              <line x1={X_START} y1={y} x2={X_END} y2={y} stroke={GRID_FILL} strokeWidth={0.5} />
            )}
          </g>
        );
      })}

      {/* 그룹 막대 */}
      {groups.map((g, i) => {
        const groupCenterX = X_START + 65 + i * GROUP_PITCH;
        const beforeX = groupCenterX - BAR_WIDTH - BAR_GAP / 2;
        const afterX = groupCenterX + BAR_GAP / 2;
        const beforeHeight = g.beforeValue * pxPerPercent;
        const afterHeight = g.afterValue * pxPerPercent;
        const beforeY = Y_AXIS_BOTTOM - beforeHeight;
        const afterY = Y_AXIS_BOTTOM - afterHeight;

        return (
          <g key={`${g.label}-${i}`}>
            {/* before 막대 */}
            <rect x={beforeX} y={beforeY} width={BAR_WIDTH} height={beforeHeight} fill={BEFORE_FILL} />
            <text
              x={beforeX + BAR_WIDTH / 2}
              y={beforeY - 7}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={TEXT_FILL}
            >
              {g.beforeValue.toFixed(1)}%
            </text>

            {/* after 막대 */}
            <rect x={afterX} y={afterY} width={BAR_WIDTH} height={afterHeight} fill={AFTER_FILL} />
            <text
              x={afterX + BAR_WIDTH / 2}
              y={afterY - 7}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={AFTER_FILL}
            >
              {g.afterValue.toFixed(1)}%
            </text>

            {/* 그룹 라벨 */}
            <text x={groupCenterX} y={300} textAnchor="middle" fontSize={12} fill={TEXT_FILL}>
              {g.label}
            </text>

            {/* 변화 마커 */}
            {g.delta && (
              <text
                x={groupCenterX}
                y={315}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill={AFTER_FILL}
              >
                {g.delta.text}
              </text>
            )}
          </g>
        );
      })}

      {/* 범례 */}
      <rect x={X_START} y={335} width={14} height={14} fill={BEFORE_FILL} />
      <text x={X_START + 20} y={346} fontSize={11} fill={TEXT_FILL}>
        {beforeLabel}
      </text>
      <rect x={X_START + 100} y={335} width={14} height={14} fill={AFTER_FILL} />
      <text x={X_START + 120} y={346} fontSize={11} fill={TEXT_FILL}>
        {afterLabel}
      </text>
    </svg>
  );
}
