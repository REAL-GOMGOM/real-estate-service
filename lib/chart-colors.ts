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
