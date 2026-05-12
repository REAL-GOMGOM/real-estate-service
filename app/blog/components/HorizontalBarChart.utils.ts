/**
 * HorizontalBarChart 순수 함수 모듈.
 *
 * baseline·autoBaseline·maxValue·라벨 잘림 자동 대응 로직을 본체에서 분리.
 * 단위 테스트 가능한 형태로 함수들을 export.
 */

import { estimateTextWidth } from '@/lib/chart-tokens';

/**
 * 차트 막대 색상 타입 — 사이클 Q에서 hex 확장.
 * - 5색 키워드: 디자인 일관성 위한 권장 옵션
 * - hex 코드 (`#abc`, `#aabbcc`, `#aabbccdd` 등 3~8자리): 작가 디자인 도구 호환
 *   (예: '#9ca3af')
 */
export type BarColor =
  | 'red'
  | 'orange'
  | 'blue'
  | 'darkBlue'
  | 'gray'
  | `#${string}`;

export interface BarRow {
  label: string;
  value: number;
  color?: BarColor;
}

/** 차트 레이아웃 명명 상수. 본체에서 이동. */
export const CHART_CONSTANTS = {
  ROW_HEIGHT: 20,
  ROW_GAP: 4,
  ROW_PITCH: 24, // ROW_HEIGHT + ROW_GAP
  TOP_PADDING: 50,
  BOTTOM_PADDING: 40,
  DIVIDER_GAP: 12,
  VALUE_LABEL_RESERVE_WIDTH: 35,
  GROUP_LABEL_PADDING: 10,
  GROUP_LABEL_FONT_SIZE: 12,
  KOREAN_CHAR_WIDTH_AT_12PX: 12,
  MIN_LABEL_AREA_LEFT_PADDING: 5,
  /** autoBaseline 공식 계수: dataMin - range × (이 값) */
  AUTO_BASELINE_RANGE_MULTIPLIER: 0.1,
  /** 잘림 캡션 영역 추가 padding (BOTTOM_PADDING 안에서 사용) */
  CLIPPED_CAPTION_RESERVE: 14,
  /** 사이클 R — 우측 라벨 fix: 막대 끝 ~ 값 라벨 사이 간격 */
  LABEL_RIGHT_PADDING: 8,
  /** 사이클 R — 우측 라벨 fix: 값 라벨 ~ viewBox 우측 끝 사이 버퍼 */
  VIEWBOX_RIGHT_BUFFER: 4,
} as const;

/**
 * 사이클 R — 우측 라벨 너비 자동 추정.
 *
 * 모든 row의 값 라벨(`{value.toFixed(1)}{unit}`) 너비 중 최대값에
 * LABEL_RIGHT_PADDING + VIEWBOX_RIGHT_BUFFER 합산.
 *
 * 사용처: availableWidth 계산 — autoScale 활성 시 막대 영역이 자동 축소되어
 * 긴 라벨(예: `4618.0조`)이 viewBox 우측 끝에서 잘리지 않도록 보장.
 *
 * autoScale 비활성(default scale 사용) 시에도 reserve가 max(기본 35, 동적 추정)으로
 * 적용되므로 좌측 zeroX 자동 확장 로직과 일관된 안전망을 형성한다.
 *
 * 음수 부호(`-`)는 toFixed가 포함하므로 자연히 반영된다. `+`/`*` 접미사는 1자(7px) 이내라
 * LABEL_RIGHT_PADDING(8)에 흡수된다.
 */
export function computeRightLabelWidth(
  data: BarRow[],
  unit: string,
): number {
  if (data.length === 0) return 0;
  const labels = data.map((row) => `${row.value.toFixed(1)}${unit}`);
  const maxLabelWidth = Math.max(...labels.map(estimateTextWidth));
  return maxLabelWidth + CHART_CONSTANTS.LABEL_RIGHT_PADDING + CHART_CONSTANTS.VIEWBOX_RIGHT_BUFFER;
}

/**
 * baseline 자동 계산.
 *
 * 공식: dataMin - range × 0.1 (보수적, 음수 안전)
 *
 * 케이스:
 * - 음수 포함 (dataMin < 0): 0 fallback (양방향 차트 의도)
 * - 양수만, range > 0: dataMin - range × 0.1
 * - 단일값 또는 모두 동일 (range 0): dataMin 그대로
 * - 빈 배열: 0
 */
export function computeAutoBaseline(values: number[]): number {
  if (values.length === 0) return 0;

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);

  if (dataMin < 0) return 0;

  const range = dataMax - dataMin;
  if (range === 0) return dataMin;

  return dataMin - range * CHART_CONSTANTS.AUTO_BASELINE_RANGE_MULTIPLIER;
}

/**
 * scale 자동 계산.
 *
 * 가장 큰 |delta| 막대가 availableWidth에 들어가도록 scale 도출.
 * delta = value - baseline (음수면 절대값 사용).
 * maxValue 지정 시 maxValue - baseline 값이 availableWidth를 채우도록 scale 결정.
 *
 * @param values 데이터 값 배열
 * @param baseline 막대 시작점
 * @param availableWidth 막대 영역 사용 가능 폭 (양수)
 * @param maxValue 이상치 컷오프 (지정 시 max delta 상한)
 */
export function computeAutoScale(
  values: number[],
  baseline: number,
  availableWidth: number,
  maxValue?: number,
): number {
  const safeWidth = Math.max(0, availableWidth);
  if (safeWidth === 0 || values.length === 0) return 1;

  let maxDelta: number;
  if (maxValue !== undefined && maxValue > 0) {
    maxDelta = Math.abs(maxValue - baseline);
  } else {
    maxDelta = Math.max(...values.map((v) => Math.abs(v - baseline)));
  }

  if (maxDelta === 0) return 1;
  return safeWidth / maxDelta;
}

/**
 * 막대 폭 계산 (이상치 컷오프 포함).
 *
 * @returns
 *   width: 실제 그릴 막대 폭 (px). 항상 >= 0
 *   isClipped: maxValue 초과로 잘렸는지
 */
export function computeBarWidth(
  value: number,
  baseline: number,
  scale: number,
  maxValue?: number,
): { width: number; isClipped: boolean } {
  const delta = value - baseline;
  const absDelta = Math.abs(delta);

  if (maxValue !== undefined && maxValue > 0) {
    const maxDelta = Math.abs(maxValue - baseline);
    if (absDelta > maxDelta) {
      return { width: maxDelta * scale, isClipped: true };
    }
  }

  return { width: absDelta * scale, isClipped: false };
}

/**
 * zeroX 자동 조정 (라벨 잘림 자동 대응).
 *
 * 라벨 max 글자수 + 음수 막대 영역 + value label 영역 합쳐서
 * 안전한 zeroX 좌표 반환. 사용자 zeroX보다 클 때만 확장 (축소 X).
 *
 * baseline > 0 이면 기존 데이터의 음수 막대는 발생하지 않음 (delta = value - baseline).
 * baseline = 0 + 음수 데이터의 경우만 음수 막대 영역 확보 필요.
 */
export function computeAutoZeroX(
  data: BarRow[],
  scale: number,
  baseline: number,
  userZeroX: number,
  config: {
    minLabelLeftPadding: number;
    groupLabelPadding: number;
    valueLabelReserveWidth: number;
    koreanCharWidthAt12px: number;
  },
  maxValue?: number,
): number {
  if (data.length === 0) return userZeroX;

  // 1. 음수 방향 막대 max 폭 (baseline 기준)
  const negativeDeltas = data
    .map((r) => r.value - baseline)
    .filter((d) => d < 0)
    .map((d) => Math.abs(d));

  let maxNegativeWidth = 0;
  if (negativeDeltas.length > 0) {
    const rawMax = Math.max(...negativeDeltas);
    const cappedMax = maxValue !== undefined && maxValue > 0
      ? Math.min(rawMax, Math.abs(maxValue - baseline))
      : rawMax;
    maxNegativeWidth = cappedMax * scale;
  }

  // 2. 라벨 max 글자수
  const maxLabelChars = Math.max(...data.map((r) => r.label.length));
  const estimatedLabelWidth = maxLabelChars * config.koreanCharWidthAt12px;

  // 3. 필요 zeroX 계산
  // 좌측 영역에 들어가야 하는 것:
  //   minLabelLeftPadding + 라벨폭 + groupLabelPadding + 음수 막대 + valueLabelReserveWidth(음수 라벨용)
  const requiredZeroX =
    config.minLabelLeftPadding +
    estimatedLabelWidth +
    config.groupLabelPadding +
    (maxNegativeWidth > 0 ? maxNegativeWidth + config.valueLabelReserveWidth : 0);

  return Math.max(userZeroX, requiredZeroX);
}
