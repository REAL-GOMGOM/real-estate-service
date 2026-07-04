'use client';
// 사유: dev warn (console.warn/info)을 브라우저 콘솔 노출 위해 client component 전환
// 사이클 N 차트 3종 (LineChart, DonutChart, StackedBarChart)과 패턴 일관
// 번들 영향: 순수 SVG 컴포넌트라 미미
// 사이클 P Step P-3 (commit 517c059 다음 단계)

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
 * - red    #E23B3B (서울 상승)
 * - orange #E8663C (경기 상승)
 * - blue   #1B4DDB (하락)
 * - darkBlue #14213D (하락 강조)
 * - gray   #8A94A8 (중립)
 */

import {
  CHART_CONSTANTS,
  computeAutoBaseline,
  computeAutoScale,
  computeAutoZeroX,
  computeBarWidth,
  computeRightLabelWidth,
  type BarRow,
} from './HorizontalBarChart.utils';
import {
  getGradientFill,
  getGradientTextFill,
  resolveChartColor,
  warnInvalidChartColor,
} from '@/lib/chart-colors';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';

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

// 사이클 S Step S-3: getGradientFill / getGradientTextFill는 lib/chart-colors로 통합.
// (사이클 N 시점 "completely identical" 주석으로 보장된 중복 제거)

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

  // Phase 8-1: 비정상 입력 방어 — throw 대신 placeholder
  if (!Array.isArray(data)) {
    return <ChartErrorPlaceholder chartName="HorizontalBarChart" reason="data prop이 배열이 아닙니다" width={width} />;
  }

  // ─── dev warn 3종 (prod 빌드에서 dead-code elimination) ───
  if (process.env.NODE_ENV !== 'production') {
    // (a) unit 미지정 + title에 "(단위: X)" 포함 → 라벨·제목 단위 불일치 가능
    if (props.unit === undefined && title) {
      const titleUnitMatch = title.match(TITLE_UNIT_REGEX);
      if (titleUnitMatch) {
         
        console.warn(
          `[HorizontalBarChart] title에 "(단위: ${titleUnitMatch[1].trim()})" 포함되어 있지만 ` +
          `unit prop이 미지정. default "%"가 적용되어 값 라벨이 의도와 불일치할 수 있음. ` +
          `예시 fix: unit="${titleUnitMatch[1].trim()}"`
        );
      }
    }

    // (b) unit 미지정 + dividerText가 단위 문자열 패턴 → 우회 사용 경고
    if (props.unit === undefined && dividerText && SHORT_UNIT_PATTERN.test(dividerText)) {
       
      console.warn(
        `[HorizontalBarChart] dividerText="${dividerText}"가 단위 문자열로 보이지만 ` +
        `unit prop이 미지정. 값 라벨은 default "%"로 표기됨. ` +
        `dividerText는 분리선 설명용이고 단위는 unit prop로 지정 권장.`
      );
    }

    // (c) discrete 모드 + 모든 row.color 미지정 → 자동 할당 발동 알림 (info 톤)
    // 사이클 P-2에서 pickDefaultColor 자동 할당 도입. (c)는 흑백 차트 위험 경고 X.
    // 작가가 자동 색상을 검토하고 의도와 일치하지 않으면 명시할 수 있도록 알림.
    const effectiveColorMode = props.colorMode ?? 'discrete';
    if (
      effectiveColorMode !== 'gradient' &&
      data.length > 0 &&
      data.every((row) => !row.color)
    ) {
       
      console.info(
        `[HorizontalBarChart] discrete 모드 모든 row.color 미지정. ` +
        `pickDefaultColor로 자동 할당 (red, blue, orange, darkBlue, gray 순). ` +
        `의도와 다르면 row.color 명시 권장.`
      );
    }

    // (d) 사이클 Q — 알 수 없는 color 값 → 자동 할당 fallback 안내
    // 사이클 S Step S-1: 공통 헬퍼 warnInvalidChartColor 호출로 통합.
    data.forEach((row, idx) => {
      warnInvalidChartColor('HorizontalBarChart', row.color, `data[${idx}].`);
    });
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

  // ─── 사이클 R: 우측 라벨 fix — max(기본 reserve, 동적 추정) ───
  // 가장 긴 값 라벨이 viewBox 우측 끝에서 잘리지 않도록 동적 reserve 산정.
  // 기본 reserve(35) 미만으로 떨어지지 않게 보장 → 회귀 0.
  const effectiveRightReserve = Math.max(
    CHART_CONSTANTS.VALUE_LABEL_RESERVE_WIDTH,
    computeRightLabelWidth(data, unit),
  );

  // ─── effective scale 결정 ───
  const availableWidth = Math.max(
    0,
    width - provisionalZeroX - effectiveRightReserve,
  );

  // ─── 오버플로 가드 (2026-07-03 실사고: 용적률 300% × scale 10 = 3,000px > viewBox) ───
  // autoScale 미사용 + 최대 막대 폭이 가용 폭을 초과하면 scale을 자동 축소한다.
  // 발동 조건이 "초과 시에만"이라 정상 범위의 기존 발행 글은 계산 결과가 동일 (회귀 0).
  // DemographicShiftBars 8-3 정규화와 동일 패턴.
  const maxAbsDelta = values.length > 0
    ? Math.max(...values.map((v) => Math.abs(v - effectiveBaseline)))
    : 0;
  const overflowClampedScale =
    !shouldAutoScale && maxAbsDelta > 0 && maxAbsDelta * scale > availableWidth
      ? availableWidth / maxAbsDelta
      : null;

  const effectiveScale = shouldAutoScale
    ? computeAutoScale(values, effectiveBaseline, availableWidth, maxValue)
    : (overflowClampedScale ?? scale);

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
        fill="#14213D"
      >
        {title}
      </text>

      {/* 기준 축선 */}
      <line
        x1={adjustedZeroX}
        y1={40}
        x2={adjustedZeroX}
        y2={axisBottom}
        stroke="#9AA4B8"
        strokeWidth={1}
      />
      <text
        x={adjustedZeroX}
        y={axisBottom + 20}
        textAnchor="middle"
        fontSize={11}
        fill="#64708A"
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
          : resolveChartColor(row.color, i, 'category');
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
              fill="#64708A"
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
          fill="#9AA4B8"
        >
          * 차트 영역을 벗어난 값
        </text>
      )}
    </svg>
  );
}
