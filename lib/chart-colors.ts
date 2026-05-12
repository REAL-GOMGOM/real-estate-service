/**
 * 차트 색상 팔레트 — 신규 차트 컴포넌트(LineChart·DonutChart·StackedBarChart) 공통.
 *
 * 기존 HorizontalBarChart는 자체 내장 함수 그대로 유지(회귀 안전망). 이 모듈은
 * 사이클 N 신규 컴포넌트만 import한다. hex 값과 임계값은 HorizontalBarChart의
 * COLORS / getGradientFill 와 *완전히 동일*. 시각 일관성 보장.
 */

export type ColorKey = 'red' | 'orange' | 'blue' | 'darkBlue' | 'gray';

/** 5색 키워드 팔레트 (HorizontalBarChart COLORS와 동일) */
export const CHART_COLORS: Record<ColorKey, string> = {
  red:      '#dc2626',
  orange:   '#ea580c',
  blue:     '#2563eb',
  darkBlue: '#1d4ed8',
  gray:     '#6b7280',
};

export type ColorIntent = 'series' | 'category';

/**
 * 시리즈 비교용 (LineChart 등). 첫 시리즈가 기준값(평균·전체)일 가능성 높아 gray 시작.
 * 데이터 시각화 관행: 기준선·평균은 무채색.
 */
const SERIES_ORDER: ColorKey[] = ['gray', 'red', 'blue', 'orange', 'darkBlue'];

/**
 * 카테고리 분포용 (DonutChart, StackedBarChart 등). 첫 카테고리가 강조 대상.
 */
const CATEGORY_ORDER: ColorKey[] = ['red', 'blue', 'orange', 'darkBlue', 'gray'];

/**
 * value 절대값 따라 그라데이션 색상 매핑.
 * HorizontalBarChart.getGradientFill 과 *완전히 동일* 공식.
 * 양수 8단계 (red→amber 농도), 음수 5단계 (blue 농도).
 */
export function getGradientFill(value: number): string {
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
export function getGradientTextFill(barFill: string): string {
  if (barFill === '#fef3c7' || barFill === '#fde68a') return '#a16207';
  return barFill;
}

/**
 * series·slice·segment 색상 자동 할당 — color 미지정 시 호출.
 * index 모듈로 순환. intent에 따라 순서가 다르다.
 */
export function pickDefaultColor(index: number, intent: ColorIntent): ColorKey {
  const order = intent === 'series' ? SERIES_ORDER : CATEGORY_ORDER;
  return order[index % order.length];
}

// ─── 사이클 S Step S-1: 4개 차트(Horizontal/Donut/Stacked/Line) color 통합 ───
// 사이클 Q에서 HorizontalBarChart에 도입된 hex 지원 패턴을 공통화.

/** hex 코드 검증 정규식 (3·4·5·6·7·8자리. 표준 RGB/RGBA 외 비표준 길이도 허용 — fail-soft) */
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;

/**
 * 차트 색상 입력 타입 — 4개 차트 공통.
 * - ColorKey: 5색 키워드 (디자인 일관성 권장)
 * - hex 코드 (`#abc`, `#aabbcc`, `#aabbccdd` 등): 자유 색상 (작가 디자인 도구 호환)
 */
export type ChartColor = ColorKey | `#${string}`;

/**
 * 차트 색상 해결 헬퍼 — 4개 차트 본체에서 직접 호출.
 *
 * 우선순위:
 *   1. 유효한 hex 코드 → 그대로 반환
 *   2. 5색 키워드 → CHART_COLORS 매핑
 *   3. 미지정 또는 알 수 없는 값 → pickDefaultColor(index, intent) 자동 할당
 *
 * 반환값은 SVG fill/stroke에 직접 사용 가능한 hex 문자열.
 */
export function resolveChartColor(
  color: ChartColor | undefined,
  index: number,
  intent: ColorIntent,
): string {
  if (color && HEX_COLOR_REGEX.test(color)) return color;
  if (color && color in CHART_COLORS) return CHART_COLORS[color as ColorKey];
  return CHART_COLORS[pickDefaultColor(index, intent)];
}

/**
 * dev 환경에서 알 수 없는 color 값 감지 시 콘솔 경고. prod 빌드에서 DCE.
 *
 * @param componentName  로그 prefix (예: 'DonutChart')
 * @param color          사용자 입력 color 값
 * @param context        식별 컨텍스트 (예: 'data[0].', 'series[2].')
 */
export function warnInvalidChartColor(
  componentName: string,
  color: ChartColor | undefined,
  context: string,
): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!color) return;
  if (HEX_COLOR_REGEX.test(color)) return;
  if (color in CHART_COLORS) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[${componentName}] ${context}color="${color}"이 ` +
    `유효한 키워드(red, orange, blue, darkBlue, gray)도 hex 코드(예: "#dc2626")도 아닙니다. ` +
    `자동 할당 적용. 의도된 색상이면 키워드 또는 hex 코드 사용 권장.`,
  );
}
