/**
 * 가로 막대 차트 — kb-report·시리즈 글 시각자료용
 *
 * 디자인 기준: kb-report-2026-polarization-where-to-buy의 SVG #1·#2·#3
 * - zeroX 200, scale 10 (1% = 10px), 행 24px 간격, 막대 높이 20px
 * - 양수: zeroX부터 오른쪽, 라벨 막대 끝 +5px
 * - 음수: zeroX부터 왼쪽, 라벨 막대 시작 -5px
 *
 * 색상 팔레트(사전정의):
 * - red    #dc2626 (서울 상승)
 * - orange #ea580c (경기 상승)
 * - blue   #2563eb (하락)
 * - darkBlue #1d4ed8 (하락 강조)
 * - gray   #6b7280 (중립)
 */

interface BarRow {
  label: string;
  value: number; // 양수 = 상승, 음수 = 하락
  color?: 'red' | 'orange' | 'blue' | 'darkBlue' | 'gray';
}

interface HorizontalBarChartProps {
  title: string;
  data: BarRow[];
  unit?: string;
  /** 분리선 후 다음 행 (0-base index). 예: 상위 10 후 점선 → dividerAfter=9 */
  dividerAfter?: number;
  /** 분리선 옆에 띄울 텍스트 (예: "하위 5") */
  dividerText?: string;
  /** viewBox width, 기본 640 */
  width?: number;
  /** 0% 기준선 x좌표, 기본 200 */
  zeroX?: number;
  /** 1 unit당 px width, 기본 10 */
  scale?: number;
}

const COLORS: Record<NonNullable<BarRow['color']>, string> = {
  red: '#dc2626',
  orange: '#ea580c',
  blue: '#2563eb',
  darkBlue: '#1d4ed8',
  gray: '#6b7280',
};

const ROW_HEIGHT = 20;
const ROW_GAP = 4; // 행 사이 빈 공간
const ROW_PITCH = ROW_HEIGHT + ROW_GAP; // 24
const TOP_PADDING = 50;
const BOTTOM_PADDING = 40;
const DIVIDER_GAP = 12; // 분리선 위/아래 추가 공간

export function HorizontalBarChart({
  title,
  data,
  unit = '%',
  dividerAfter,
  dividerText,
  width = 640,
  zeroX = 200,
  scale = 10,
}: HorizontalBarChartProps) {
  const dividerExtra =
    dividerAfter !== undefined ? DIVIDER_GAP * 2 : 0;
  const height =
    TOP_PADDING + data.length * ROW_PITCH + BOTTOM_PADDING + dividerExtra;
  const axisBottom = TOP_PADDING + data.length * ROW_PITCH + dividerExtra - ROW_GAP;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: '100%',
        height: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* 제목 */}
      <text
        x={width / 2}
        y={24}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        fill="#111827"
      >
        {title}
      </text>

      {/* 0% 기준 축선 */}
      <line
        x1={zeroX}
        y1={40}
        x2={zeroX}
        y2={axisBottom}
        stroke="#9ca3af"
        strokeWidth={1}
      />
      <text
        x={zeroX}
        y={axisBottom + 20}
        textAnchor="middle"
        fontSize={11}
        fill="#6b7280"
      >
        0{unit}
      </text>

      {/* 데이터 행 */}
      {data.map((row, i) => {
        const offset = dividerAfter !== undefined && i > dividerAfter
          ? DIVIDER_GAP * 2
          : 0;
        const yRect = TOP_PADDING + i * ROW_PITCH + offset;
        const yLabel = yRect + 14;
        const isPositive = row.value >= 0;
        const barWidth = Math.abs(row.value) * scale;
        const barX = isPositive ? zeroX : zeroX - barWidth;
        const valueLabelX = isPositive ? barX + barWidth + 5 : barX - 5;
        const valueLabelAnchor = isPositive ? 'start' : 'end';
        const fill = COLORS[row.color ?? 'gray'];

        return (
          <g key={`${row.label}-${i}`}>
            {/* 자치구·시 라벨 */}
            <text
              x={zeroX - 10}
              y={yLabel}
              textAnchor="end"
              fontSize={12}
              fill="#374151"
            >
              {row.label}
            </text>
            {/* 막대 */}
            <rect
              x={barX}
              y={yRect}
              width={barWidth}
              height={ROW_HEIGHT}
              fill={fill}
            />
            {/* 값 라벨 */}
            <text
              x={valueLabelX}
              y={yLabel}
              textAnchor={valueLabelAnchor}
              fontSize={11}
              fill={fill}
              fontWeight={600}
            >
              {isPositive ? '+' : ''}
              {row.value.toFixed(1)}
              {unit}
            </text>
          </g>
        );
      })}

      {/* 분리선 + 텍스트 */}
      {dividerAfter !== undefined && (
        <>
          <line
            x1={40}
            y1={TOP_PADDING + (dividerAfter + 1) * ROW_PITCH + DIVIDER_GAP - 2}
            x2={width - 40}
            y2={TOP_PADDING + (dividerAfter + 1) * ROW_PITCH + DIVIDER_GAP - 2}
            stroke="#e5e7eb"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          {dividerText && (
            <text
              x={width / 2}
              y={TOP_PADDING + (dividerAfter + 1) * ROW_PITCH + DIVIDER_GAP + 10}
              textAnchor="middle"
              fontSize={11}
              fill="#6b7280"
            >
              {dividerText}
            </text>
          )}
        </>
      )}
    </svg>
  );
}
