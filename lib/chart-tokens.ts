/**
 * 차트 디자인 토큰 — 신규 차트 컴포넌트(LineChart·DonutChart·StackedBarChart) 공통.
 *
 * 기존 HorizontalBarChart는 자체 내장 상수 그대로 유지(회귀 안전망). 이 모듈은
 * 사이클 N 신규 컴포넌트만 import한다. hex 값은 HorizontalBarChart와 동일하게
 * 맞춰서 시각 일관성을 보장한다.
 */
export const CHART_TOKENS = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fills: {
    /** 차트 제목 */
    title:    '#111827',
    /** 축 라벨, 카테고리명 */
    header:   '#374151',
    /** 보조 라벨, 캡션 */
    subLabel: '#6b7280',
    /** 축선 */
    axis:     '#9ca3af',
    /** 그리드 */
    grid:     '#e5e7eb',
  },
  fontSize: {
    title:    14,
    label:    12,
    subLabel: 11,
    micro:    10,
  },
} as const;
