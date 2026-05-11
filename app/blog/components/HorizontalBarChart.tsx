/**
 * 가로 막대 차트 — kb-report·시리즈 글 시각자료용
 *
 * 디자인 기준: kb-report-2026-polarization-where-to-buy의 SVG #1·#2·#3
 * - zeroX 200, scale 10 (1% = 10px), 행 24px 간격, 막대 높이 20px
 * - 양수: zeroX부터 오른쪽, 라벨 막대 끝 +5px
 * - 음수: zeroX부터 왼쪽, 라벨 막대 시작 -5px
 *
 * 사이클 K 추가 기능 (모두 optional, 미지정 시 기존 동작 100% 동일):
 * - baseline / autoBaseline: 큰 값 좁은 범위 차이 강조 (예: 평당가 2166 vs 2437)
 * - maxValue: 이상치 컷오프, 잘리면 ▶/◀ 표시 + 캡션
 * - autoScale: baseline·maxValue에 맞춰 scale 자동 계산
 * - 라벨 잘림 자동 대응: zeroX가 부족하면 자동 확장 (축소 X)
 *
 * 색상 팔레트(사전정의):
 * - red    #dc2626 (서울 상승)
 * - orange #ea580c (경기 상승)
 * - blue   #2563eb (하락)
 * - darkBlue #1d4ed8 (하락 강조)
 * - gray   #6b7280 (중립)
 */

import {
  CHART_CONSTANTS,
  computeAutoBaseline,
  computeAutoScale,
  computeAutoZeroX,
  computeBarWidth,
  type BarRow,
} from './HorizontalBarChart.utils';

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
  /** 0% 기준선 x좌표, 기본 200. 라벨 영역 부족 시 자동 확장됨. */
  zeroX?: number;
  /** 1 unit당 px width, 기본 10 */
  scale?: number;
  /**
   * 'discrete': data[].color 5색 팔레트 사용 (기본)
   * 'gradient': value 절대값 따라 자동 색상 매핑 (서울 25개·경기 25개 같은 그라데이션 차트)
   */
  colorMode?: 'discrete' | 'gradient';
  // ─── 사이클 K 신규 (모두 optional) ───
  /** 막대 시작점. 미지정 시 0 (현재 동작 동일). 큰 값 좁은 범위 강조용 */
  baseline?: number;
  /** 자동 baseline 계산 (dataMin - range × 0.1, 음수면 0). default false */
  autoBaseline?: boolean;
  /** 막대 폭 상한 (이상치 컷오프). 초과 시 ▶/◀ 표시 + 캡션 */
  maxValue?: number;
  /** baseline·maxValue 따라 scale 자동. default: baseline·autoBaseline 또는 maxValue 지정 시 true */
  autoScale?: boolean;
}

const COLORS: Record<NonNullable<BarRow['color']>, string> = {
  red:      '#dc2626',
  orange:   '#ea580c',
  blue:     '#2563eb',
  darkBlue: '#1d4ed8',
  gray:     '#6b7280',
};

/**
 * value 절대값 따라 그라데이션 색상 매핑 (kb-report SVG #2·#3 패턴)
 * 양수 8단계 (red→orange→amber 농도), 음수 5단계 (blue 농도)
 */
function getGradientFill(value: number): string {
  if (value >= 16) return '#dc2626';
  if (value >= 13) return '#ef4444';
  if (value >= 11) return '#f97316';
  if (value >= 7)  return '#f59e0b';
  if (value >= 5)  return '#fbbf24';
  if (value >= 3)  return '#fcd34d';
  if (value >= 1.5) return '#fde68a';
  if (value >= 0)   return '#fef3c7';
  if (value > -1)   return '#93c5fd';
  if (value > -2)   return '#60a5fa';
  if (value > -5)   return '#3b82f6';
  if (value > -6.5) return '#2563eb';
  return '#1d4ed8';
}

/** 옅은 막대 색상이면 텍스트는 더 진한 색상으로 (대비 보장) */
function getGradientTextFill(barFill: string): string {
  if (barFill === '#fef3c7' || barFill === '#fde68a') return '#a16207';
  return barFill;
}

// dev warn 패턴 — 사이클 P Step P-1
const TITLE_UNIT_REGEX = /\(단위[:\s]*([^)]+)\)/;
// dividerText가 단위 문자열로 보이는 패턴 — "억", "%", "%p", "조 원", "건" 등 5자 이하
const SHORT_UNIT_PATTERN = /^[%가-힣\sp]{1,5}$/;

export function HorizontalBarChart(props: HorizontalBarChartProps) {
  const {
    title,
    data,
    unit = '%',
    dividerAfter,
    dividerText,
    width = 640,
    zeroX = 200,
    scale = 10,
    colorMode = 'discrete',
    baseline,
    autoBaseline = false,
    maxValue,
    autoScale,
  } = props;

  // ─── dev warn 3종 (prod 빌드에서 dead-code elimination) ───
  if (process.env.NODE_ENV !== 'production') {
    // (a) unit 미지정 + title에 "(단위: X)" 포함 → 라벨·제목 단위 불일치 가능
    if (props.unit === undefined && title) {
      const titleUnitMatch = title.match(TITLE_UNIT_REGEX);
      if (titleUnitMatch) {
        // eslint-disable-next-line no-console
        console.warn(
          `[HorizontalBarChart] title에 "(단위: ${titleUnitMatch[1].trim()})" 포함되어 있지만 ` +
          `unit prop이 미지정. default "%"가 적용되어 값 라벨이 의도와 불일치할 수 있음. ` +
          `예시 fix: unit="${titleUnitMatch[1].trim()}"`
        );
      }
    }

    // (b) unit 미지정 + dividerText가 단위 문자열 패턴 → 우회 사용 경고
    if (props.unit === undefined && dividerText && SHORT_UNIT_PATTERN.test(dividerText)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[HorizontalBarChart] dividerText="${dividerText}"가 단위 문자열로 보이지만 ` +
        `unit prop이 미지정. 값 라벨은 default "%"로 표기됨. ` +
        `dividerText는 분리선 설명용이고 단위는 unit prop로 지정 권장.`
      );
    }

    // (c) discrete 모드 + 모든 row.color 미지정 → 단조 흑백 차트 경고
    const effectiveColorMode = props.colorMode ?? 'discrete';
    if (
      effectiveColorMode !== 'gradient' &&
      data.length > 0 &&
      data.every((row) => !row.color)
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `[HorizontalBarChart] discrete 모드에서 모든 row의 color가 미지정. ` +
        `의도된 흑백 차트가 아니면 row.color 명시 또는 colorMode="gradient" 추가 권장.`
      );
    }
  }

  // ─── effective baseline 결정 ───
  // autoBaseline > baseline > 0 (default — 기존 동작과 동일)
  const values = data.map((r) => r.value);
  const effectiveBaseline = autoBaseline
    ? computeAutoBaseline(values)
    : (baseline ?? 0);

  // autoScale default: 신규 prop이 사용된 경우만 true. 기존 호출은 false → scale prop 그대로.
  const shouldAutoScale =
    autoScale ?? (baseline !== undefined || autoBaseline || (maxValue !== undefined && maxValue > 0));

  // ─── zeroX 자동 조정 (라벨 잘림 자동 대응) ───
  // 호환성 보장: 신규 props (baseline·autoBaseline·maxValue) 미사용 시 zeroX 그대로 (확장 X).
  // 기존 4개 발행 글은 모두 default 분기 → adjustedZeroX === userZeroX 유지.
  // 신규 props 사용 시에만 라벨/막대 영역 기반 자동 확장. 사용자 zeroX보다 작아지지는 않음.
  const useAutoLayout =
    baseline !== undefined ||
    autoBaseline ||
    (maxValue !== undefined && maxValue > 0);

  const zeroXConfig = {
    minLabelLeftPadding:    CHART_CONSTANTS.MIN_LABEL_AREA_LEFT_PADDING,
    groupLabelPadding:      CHART_CONSTANTS.GROUP_LABEL_PADDING,
    valueLabelReserveWidth: CHART_CONSTANTS.VALUE_LABEL_RESERVE_WIDTH,
    koreanCharWidthAt12px:  CHART_CONSTANTS.KOREAN_CHAR_WIDTH_AT_12PX,
  };

  // 1차 추정: 신규 props 사용 시에만 자동 확장
  const provisionalZeroX = useAutoLayout
    ? computeAutoZeroX(data, scale, effectiveBaseline, zeroX, zeroXConfig, maxValue)
    : zeroX;

  // ─── effective scale 결정 ───
  const availableWidth = Math.max(
    0,
    width - provisionalZeroX - CHART_CONSTANTS.VALUE_LABEL_RESERVE_WIDTH,
  );
  const effectiveScale = shouldAutoScale
    ? computeAutoScale(values, effectiveBaseline, availableWidth, maxValue)
    : scale;

  // autoScale일 때 scale 변경 → 음수 막대 영역도 변함 → zeroX 재보정
  const adjustedZeroX = useAutoLayout && shouldAutoScale
    ? computeAutoZeroX(data, effectiveScale, effectiveBaseline, zeroX, zeroXConfig, maxValue)
    : provisionalZeroX;

  // ─── 라벨 영역 계산 ───
  // baseline 적용 시 음수 delta가 있을 수 있고 (value < baseline), baseline=0 + 음수 데이터도 있음.
  const negativeDeltas = data
    .map((r) => r.value - effectiveBaseline)
    .filter((d) => d < 0)
    .map((d) => Math.abs(d));
  const maxNegativeWidth = negativeDeltas.length > 0
    ? Math.max(...negativeDeltas) * effectiveScale
    : 0;
  const hasNegative = maxNegativeWidth > 0;

  const groupLabelX = hasNegative
    ? adjustedZeroX - maxNegativeWidth - CHART_CONSTANTS.VALUE_LABEL_RESERVE_WIDTH - CHART_CONSTANTS.GROUP_LABEL_PADDING
    : adjustedZeroX - CHART_CONSTANTS.GROUP_LABEL_PADDING;

  // 라벨 길이 검증 — viewBox 밖으로 나가는지 dev 경고 (zeroX 자동 조정의 안전망)
  const maxLabelChars = Math.max(...data.map((r) => r.label.length));
  const estimatedMaxLabelWidth = maxLabelChars * CHART_CONSTANTS.KOREAN_CHAR_WIDTH_AT_12PX;
  const labelStartX = groupLabelX - estimatedMaxLabelWidth;

  if (
    process.env.NODE_ENV !== 'production' &&
    labelStartX < CHART_CONSTANTS.MIN_LABEL_AREA_LEFT_PADDING
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[HorizontalBarChart] "${title}" 라벨 영역 부족 — ` +
        `labelStartX=${labelStartX.toFixed(0)} < ${CHART_CONSTANTS.MIN_LABEL_AREA_LEFT_PADDING}. ` +
        `라벨 max 글자수=${maxLabelChars}. width(${width}) 또는 zeroX(${zeroX}) 키우세요.`,
    );
  }

  // ─── 잘림 발생 여부 (캡션 표시용) ───
  const hasClipped = data.some(
    (r) => computeBarWidth(r.value, effectiveBaseline, effectiveScale, maxValue).isClipped,
  );

  const dividerExtra = dividerAfter !== undefined ? CHART_CONSTANTS.DIVIDER_GAP * 2 : 0;
  const captionExtra = hasClipped ? CHART_CONSTANTS.CLIPPED_CAPTION_RESERVE : 0;
  const height =
    CHART_CONSTANTS.TOP_PADDING +
    data.length * CHART_CONSTANTS.ROW_PITCH +
    CHART_CONSTANTS.BOTTOM_PADDING +
    dividerExtra +
    captionExtra;
  const axisBottom =
    CHART_CONSTANTS.TOP_PADDING +
    data.length * CHART_CONSTANTS.ROW_PITCH +
    dividerExtra -
    CHART_CONSTANTS.ROW_GAP;

  // 축 라벨: baseline=0이면 "0%", 그 외에는 baseline 값 표시
  const axisLabel = effectiveBaseline === 0
    ? `0${unit}`
    : `${effectiveBaseline.toFixed(effectiveBaseline % 1 === 0 ? 0 : 1)}${unit}`;

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

      {/* 기준 축선 */}
      <line
        x1={adjustedZeroX}
        y1={40}
        x2={adjustedZeroX}
        y2={axisBottom}
        stroke="#9ca3af"
        strokeWidth={1}
      />
      <text
        x={adjustedZeroX}
        y={axisBottom + 20}
        textAnchor="middle"
        fontSize={11}
        fill="#6b7280"
      >
        {axisLabel}
      </text>

      {/* 데이터 행 */}
      {data.map((row, i) => {
        const offset = dividerAfter !== undefined && i > dividerAfter
          ? CHART_CONSTANTS.DIVIDER_GAP * 2
          : 0;
        const yRect = CHART_CONSTANTS.TOP_PADDING + i * CHART_CONSTANTS.ROW_PITCH + offset;
        const yLabel = yRect + 14;

        const valueDelta = row.value - effectiveBaseline;
        const isPositive = valueDelta >= 0;
        const { width: barWidth, isClipped } = computeBarWidth(
          row.value,
          effectiveBaseline,
          effectiveScale,
          maxValue,
        );
        const barX = isPositive ? adjustedZeroX : adjustedZeroX - barWidth;
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
              fontSize={CHART_CONSTANTS.GROUP_LABEL_FONT_SIZE}
              fill="#374151"
            >
              {row.label}
            </text>
            {/* 막대 */}
            <rect
              x={barX}
              y={yRect}
              width={barWidth}
              height={CHART_CONSTANTS.ROW_HEIGHT}
              fill={fill}
            />
            {/* 잘림 표시 (▶/◀) */}
            {isClipped && (
              <text
                x={isPositive ? barX + barWidth - 14 : barX + 4}
                y={yLabel}
                fontSize={14}
                fill="#ffffff"
                fontWeight={700}
              >
                {isPositive ? '▶' : '◀'}
              </text>
            )}
            {/* 값 라벨 */}
            <text
              x={valueLabelX}
              y={yLabel}
              textAnchor={valueLabelAnchor}
              fontSize={11}
              fill={textFill}
              fontWeight={600}
            >
              {isPositive && effectiveBaseline === 0 ? '+' : ''}
              {row.value.toFixed(1)}
              {unit}
              {isClipped ? '*' : ''}
            </text>
          </g>
        );
      })}

      {/* 분리선 + 텍스트 */}
      {dividerAfter !== undefined && (
        <>
          <line
            x1={40}
            y1={CHART_CONSTANTS.TOP_PADDING + (dividerAfter + 1) * CHART_CONSTANTS.ROW_PITCH + CHART_CONSTANTS.DIVIDER_GAP - 2}
            x2={width - 40}
            y2={CHART_CONSTANTS.TOP_PADDING + (dividerAfter + 1) * CHART_CONSTANTS.ROW_PITCH + CHART_CONSTANTS.DIVIDER_GAP - 2}
            stroke="#e5e7eb"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          {dividerText && (
            <text
              x={width / 2}
              y={CHART_CONSTANTS.TOP_PADDING + (dividerAfter + 1) * CHART_CONSTANTS.ROW_PITCH + CHART_CONSTANTS.DIVIDER_GAP + 10}
              textAnchor="middle"
              fontSize={11}
              fill="#6b7280"
            >
              {dividerText}
            </text>
          )}
        </>
      )}

      {/* 잘림 캡션 */}
      {hasClipped && (
        <text
          x={width / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize={10}
          fill="#9ca3af"
        >
          * 차트 영역을 벗어난 값
        </text>
      )}
    </svg>
  );
}
