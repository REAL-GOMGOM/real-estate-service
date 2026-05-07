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
  /**
   * 'discrete': data[].color에 박힌 5색 팔레트 사용 (기본)
   * 'gradient': value 절대값 따라 자동 색상 매핑 (서울 25개·경기 25개 같은 그라데이션 차트)
   */
  colorMode?: 'discrete' | 'gradient';
}

const COLORS: Record<NonNullable<BarRow['color']>, string> = {
  red: '#dc2626',
  orange: '#ea580c',
  blue: '#2563eb',
  darkBlue: '#1d4ed8',
  gray: '#6b7280',
};

/**
 * value 절대값 따라 그라데이션 색상 매핑 (kb-report SVG #2·#3 패턴)
 * 양수 8단계 (red→orange→amber 농도), 음수 5단계 (blue 농도)
 */
function getGradientFill(value: number): string {
  if (value >= 16) return '#dc2626';
  if (value >= 13) return '#ef4444';
  if (value >= 11) return '#f97316';
  if (value >= 7) return '#f59e0b';
  if (value >= 5) return '#fbbf24';
  if (value >= 3) return '#fcd34d';
  if (value >= 1.5) return '#fde68a';
  if (value >= 0) return '#fef3c7';
  if (value > -1) return '#93c5fd';
  if (value > -2) return '#60a5fa';
  if (value > -5) return '#3b82f6';
  if (value > -6.5) return '#2563eb';
  return '#1d4ed8';
}

/**
 * 옅은 막대 색상이면 텍스트는 더 진한 색상으로 (대비 보장)
 */
function getGradientTextFill(barFill: string): string {
  if (barFill === '#fef3c7' || barFill === '#fde68a') return '#a16207';
  return barFill;
}

const ROW_HEIGHT = 20;
const ROW_GAP = 4; // 행 사이 빈 공간
const ROW_PITCH = ROW_HEIGHT + ROW_GAP; // 24
const TOP_PADDING = 50;
const BOTTOM_PADDING = 40;
const DIVIDER_GAP = 12; // 분리선 위/아래 추가 공간

/** 값 라벨 영역 폭 추정 ("+24.0%" 같은 형태, font 11px 600 weight 기준 약 30px). 안전하게 35 */
const VALUE_LABEL_RESERVE_WIDTH = 35;
/** 자치구 라벨과 인접 영역 사이 여백 */
const GROUP_LABEL_PADDING = 10;
/** 자치구 라벨 폰트 크기 — 라벨 너비 추정용 */
const GROUP_LABEL_FONT_SIZE = 12;
/** 한글 글자 1자 평균 너비 (font 12px 기준 추정) */
const KOREAN_CHAR_WIDTH_AT_12PX = 12;
/** SVG viewBox 왼쪽 최소 여백 — 라벨이 잘리지 않을 안전선 */
const MIN_LABEL_AREA_LEFT_PADDING = 5;

export function HorizontalBarChart({
  title,
  data,
  unit = '%',
  dividerAfter,
  dividerText,
  width = 640,
  zeroX = 200,
  scale = 10,
  colorMode = 'discrete',
}: HorizontalBarChartProps) {
  // 음수 막대 max 절대값 (없으면 0). 라벨 위치 계산용
  const maxNegativeWidth = Math.max(
    0,
    ...data.filter((r) => r.value < 0).map((r) => Math.abs(r.value) * scale),
  );
  const hasNegative = maxNegativeWidth > 0;

  // 자치구 라벨 x 위치
  // - 양수 only: 기존 동작 유지 (zeroX 왼쪽 padding)
  // - 음수 포함: 음수 막대 영역 + 값 라벨 영역 더 왼쪽으로
  const groupLabelX = hasNegative
    ? zeroX - maxNegativeWidth - VALUE_LABEL_RESERVE_WIDTH - GROUP_LABEL_PADDING
    : zeroX - GROUP_LABEL_PADDING;

  // 라벨 길이 검증 — viewBox 밖으로 나가는지 dev mode 경고
  const maxLabelChars = Math.max(...data.map((r) => r.label.length));
  const estimatedMaxLabelWidth = maxLabelChars * KOREAN_CHAR_WIDTH_AT_12PX;
  const labelStartX = groupLabelX - estimatedMaxLabelWidth;

  if (
    process.env.NODE_ENV !== 'production' &&
    labelStartX < MIN_LABEL_AREA_LEFT_PADDING
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[HorizontalBarChart] "${title}" 라벨 영역 부족 — ` +
        `labelStartX=${labelStartX.toFixed(0)} < ${MIN_LABEL_AREA_LEFT_PADDING}. ` +
        `라벨 max 글자수=${maxLabelChars}. width(${width}) 또는 zeroX(${zeroX}) 키우거나 라벨 줄이세요.`,
    );
  }

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
        const fill = colorMode === 'gradient'
          ? getGradientFill(row.value)
          : COLORS[row.color ?? 'gray'];
        const textFill = colorMode === 'gradient'
          ? getGradientTextFill(fill)
          : fill;

        return (
          <g key={`${row.label}-${i}`}>
            {/* 자치구·시 라벨 */}
            <text
              x={groupLabelX}
              y={yLabel}
              textAnchor="end"
              fontSize={GROUP_LABEL_FONT_SIZE}
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
              fill={textFill}
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
