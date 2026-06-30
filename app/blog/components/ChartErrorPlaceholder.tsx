/**
 * ChartErrorPlaceholder — 차트 12종 공용 방어 placeholder.
 *
 * Phase 8-1 도입. 차트 본체가 잘못된 props(누락·타입오류)로 throw 하면
 * blog 페이지 전체가 다운된다(루트 error.tsx로 fallback). 본 컴포넌트는
 * 각 차트의 함수 본체 초입에서 가드 분기 시 반환할 안전한 대체 UI.
 *
 * 표시 정책:
 * - prod: 담백한 "차트를 표시할 수 없습니다" 한 줄
 * - dev:  추가로 `[chartName] reason` 상세 노출 → 작가가 즉시 진단 가능
 *
 * 디자인:
 * - 점선 회색 박스 + 가운데 안내 텍스트 (깨진 느낌 없이 의도된 빈 자리)
 * - 다른 차트의 빈 데이터 placeholder와 톤 통일
 */

'use client';

import { CHART_TOKENS } from '@/lib/chart-tokens';

interface ChartErrorPlaceholderProps {
  /** 차트 이름 — dev 메시지에 prefix로 노출 (예: 'LineChart') */
  chartName: string;
  /** 잘못된 이유 — dev에서만 노출 (예: 'series prop이 배열이 아닙니다') */
  reason:    string;
  /** placeholder 박스 너비 (px). 차트 기본 width와 맞춰 호출. */
  width?:    number;
  /** placeholder 박스 높이 (px). 차트 기본 height와 맞춰 호출. */
  height?:   number;
}

const DEFAULT_WIDTH  = 640;
const DEFAULT_HEIGHT = 240;
const MESSAGE        = '차트를 표시할 수 없습니다';

export function ChartErrorPlaceholder({
  chartName,
  reason,
  width  = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
}: ChartErrorPlaceholderProps) {
  const isDev    = process.env.NODE_ENV !== 'production';
  const safeW    = Math.max(0, width);
  const safeH    = Math.max(0, height);
  const centerX  = safeW / 2;
  const centerY  = safeH / 2;

  return (
    <svg
      viewBox={`0 0 ${safeW} ${safeH}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={MESSAGE}
      style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
    >
      <title>{MESSAGE}</title>
      <rect
        x={1}
        y={1}
        width={Math.max(0, safeW - 2)}
        height={Math.max(0, safeH - 2)}
        fill={CHART_TOKENS.fills.grid}
        opacity={0.25}
        stroke={CHART_TOKENS.fills.axis}
        strokeWidth={1}
        strokeDasharray="6 4"
        rx={6}
      />
      <text
        x={centerX}
        y={isDev ? centerY - 6 : centerY + 4}
        textAnchor="middle"
        fontSize={CHART_TOKENS.fontSize.label}
        fill={CHART_TOKENS.fills.subLabel}
      >
        {MESSAGE}
      </text>
      {isDev && (
        <text
          x={centerX}
          y={centerY + 14}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.subLabel}
          fill={CHART_TOKENS.fills.subLabel}
          opacity={0.85}
        >
          [{chartName}] {reason}
        </text>
      )}
    </svg>
  );
}
