/**
 * SparkLine — 미니 추세선. 축·라벨 없음. 인라인 텍스트 흐름용.
 *
 * 사이클 O Phase 1 신규 컴포넌트.
 * 접근성: 다른 차트(useId titleId/descId)와 패턴이 다름 — 단일 aria-label.
 *  · ariaLabel은 필수 prop (인라인이라 desc 자동 생성 패턴 미적용)
 *  · <title>은 ariaLabel로 채움
 */

'use client';

import { warnInvalidChartColor } from '@/lib/chart-colors';
import { CHART_TOKENS } from '@/lib/chart-tokens';
import { ChartErrorPlaceholder } from './ChartErrorPlaceholder';
import {
  buildSparkArea,
  buildSparkPath,
  computeSparkDomain,
  mapSparkPoints,
  resolveSparkColor,
  type SparkColor,
} from './SparkLine.utils';

interface SparkLineProps {
  data:        number[];
  width?:      number;
  height?:     number;
  color?:      SparkColor;
  showEndDot?: boolean;
  showArea?:   boolean;
  ariaLabel:   string;
  trendColor?: boolean;
}

const INNER_PADDING   = 2;   // 점·선이 viewBox 가장자리에 잘리지 않도록
const STROKE_WIDTH    = 1.5;
const END_DOT_RADIUS  = 2.5;
const AREA_OPACITY    = 0.2;

export function SparkLine({
  data,
  width      = 120,
  height     = 32,
  color,
  showEndDot = true,
  showArea   = false,
  ariaLabel,
  trendColor = true,
}: SparkLineProps) {
  // Phase 8-1: 비정상 입력 방어 — SparkLine은 hook 없음 → 첫 줄에 가드 가능
  if (!Array.isArray(data)) {
    return <ChartErrorPlaceholder chartName="SparkLine" reason="data prop이 배열이 아닙니다" width={width} height={height} />;
  }

  const safeWidth  = Math.max(0, width);
  const safeHeight = Math.max(0, height);

  // dev mode 경고 — 알 수 없는 color 값
  if (process.env.NODE_ENV !== 'production') {
    warnInvalidChartColor('SparkLine', color, 'color ');
  }

  // ─── 빈 데이터 placeholder (가로 점선만) ───
  if (data.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={ariaLabel}
        style={{ display: 'inline-block', width: safeWidth, height: safeHeight, verticalAlign: 'middle' }}
      >
        <title>{ariaLabel}</title>
        <line
          x1={INNER_PADDING}
          y1={safeHeight / 2}
          x2={safeWidth - INNER_PADDING}
          y2={safeHeight / 2}
          stroke={CHART_TOKENS.fills.grid}
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const domain    = computeSparkDomain(data);
  const points    = mapSparkPoints(data, domain, safeWidth, safeHeight, INNER_PADDING);
  const stroke    = resolveSparkColor(data, color, trendColor);
  const linePath  = buildSparkPath(points);
  const baselineY = safeHeight - INNER_PADDING;
  const areaPath  = showArea ? buildSparkArea(points, baselineY) : '';
  const endPoint  = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${safeWidth} ${safeHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
      style={{ display: 'inline-block', width: safeWidth, height: safeHeight, verticalAlign: 'middle' }}
    >
      <title>{ariaLabel}</title>

      {/* 면적 (옵션) */}
      {showArea && points.length > 1 && (
        <path d={areaPath} fill={stroke} fillOpacity={AREA_OPACITY} stroke="none" />
      )}

      {/* 선 */}
      {points.length > 1 && (
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={STROKE_WIDTH} />
      )}

      {/* 단일 점 — 선이 없으니 점만 강조 */}
      {points.length === 1 && (
        <circle cx={points[0].cx} cy={points[0].cy} r={END_DOT_RADIUS} fill={stroke} />
      )}

      {/* 끝점 강조 (옵션) */}
      {showEndDot && points.length > 1 && (
        <circle
          cx={endPoint.cx}
          cy={endPoint.cy}
          r={END_DOT_RADIUS}
          fill={stroke}
          stroke="#ffffff"
          strokeWidth={0.5}
        />
      )}
    </svg>
  );
}

export type { SparkColor } from './SparkLine.utils';
