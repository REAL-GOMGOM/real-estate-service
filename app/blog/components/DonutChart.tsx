/**
 * DonutChart — 비율·점유율 (단지 구성, 매수자 분포)
 *
 * 사이클 N 신규. HorizontalBarChart·LineChart 패턴 일관:
 * - 자체 SVG arc path (lib 미사용)
 * - 5색 키워드 + category intent 자동 할당
 * - lib/chart-tokens, lib/chart-colors 재사용
 * - 접근성: <title>·<desc>·role='img'·aria-labelledby
 *
 * 데이터-잉크 비율: 슬라이스 자체가 핵심 → 그리드·축 없음. 라벨은 의미 있는 슬라이스만.
 */

'use client';

import { useId } from 'react';
import { CHART_COLORS } from '@/lib/chart-colors';
import { CHART_TOKENS } from '@/lib/chart-tokens';
import {
  computeSlice,
  computeSliceLayout,
  computeLabelPosition,
  computeMidVector,
  resolveSliceColor,
  generateAriaDesc,
  SLICE_LABEL_OMIT_THRESHOLD,
  HIGHLIGHTED_OFFSET_PX,
  OUTER_LABEL_GAP_PX,
  type DonutSlice,
} from './DonutChart.utils';

interface DonutChartProps {
  title:             string;
  data:              DonutSlice[];
  unit?:             string;             // default '%'
  size?:             number;             // default 360
  innerRadius?:      number;             // default size × 0.32 (0이면 Pie)
  showLabels?:       boolean;            // default true
  showPercentages?:  boolean;            // default true
  centerText?:       string;
  centerSubtext?:    string;
  ariaDesc?:         string;
}

const DEFAULT_SIZE          = 360;
const DEFAULT_INNER_RATIO   = 0.32;
const STROKE_WIDTH_BETWEEN  = 2;        // 슬라이스 사이 흰색 구분선
const LABEL_CONNECTOR_GAP   = 3;        // 라벨 연결선과 호 사이 여백
const CENTER_TEXT_OFFSET    = -4;       // centerText baseline 미세 보정
const CENTER_SUBTEXT_OFFSET = 14;       // centerSubtext가 centerText 아래
const OUTER_LABEL_PADDING   = 32;       // viewBox 외곽 여백 (라벨 공간)

export function DonutChart({
  title,
  data,
  unit             = '%',
  size             = DEFAULT_SIZE,
  innerRadius,
  showLabels       = true,
  showPercentages  = true,
  centerText,
  centerSubtext,
  ariaDesc,
}: DonutChartProps) {
  const chartId = useId();
  const titleId = `${chartId}-title`;
  const descId  = `${chartId}-desc`;

  const safeSize = Math.max(0, size);
  // viewBox는 size + 라벨 외곽 여백. cx, cy는 viewBox 중심.
  const viewSize = safeSize + OUTER_LABEL_PADDING * 2;
  const cx = viewSize / 2;
  const cy = viewSize / 2 + 12; // 제목 영역(상단 28px)만큼 살짝 내림
  const outerRadius = safeSize / 2;
  const effectiveInner =
    innerRadius !== undefined
      ? Math.max(0, Math.min(innerRadius, outerRadius - 1))
      : outerRadius * DEFAULT_INNER_RATIO;

  const computed = computeSliceLayout(data);

  // dev mode 경고 — 음수 슬라이스 사용자 알림
  if (process.env.NODE_ENV !== 'production') {
    const hasNeg = data.some((s) => s.value < 0);
    if (hasNeg) {
      // eslint-disable-next-line no-console
      console.warn(`[DonutChart] "${title}" 음수 value 감지 — 0으로 처리됨`);
    }
  }

  // 빈 데이터 placeholder
  if (computed.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize + 30}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{ariaDesc ?? '데이터가 없는 빈 도넛 차트'}</desc>
        <text
          x={viewSize / 2}
          y={28}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.title}
          fontWeight={600}
          fill={CHART_TOKENS.fills.title}
        >
          {title}
        </text>
        <circle cx={cx} cy={cy} r={outerRadius} fill={CHART_TOKENS.fills.grid} opacity={0.3} />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.label}
          fill={CHART_TOKENS.fills.subLabel}
        >
          데이터 없음
        </text>
      </svg>
    );
  }

  const desc = ariaDesc ?? generateAriaDesc(data);

  return (
    <svg
      viewBox={`0 0 ${viewSize} ${viewSize + 30}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${titleId} ${descId}`}
      style={{ width: '100%', height: 'auto', fontFamily: CHART_TOKENS.fontFamily }}
    >
      <title id={titleId}>{title}</title>
      <desc id={descId}>{desc}</desc>

      {/* 제목 */}
      <text
        x={viewSize / 2}
        y={28}
        textAnchor="middle"
        fontSize={CHART_TOKENS.fontSize.title}
        fontWeight={600}
        fill={CHART_TOKENS.fills.title}
      >
        {title}
      </text>

      {/* 슬라이스 */}
      {computed.map((c) => {
        const colorKey = resolveSliceColor(c.slice, c.index);
        const fill = CHART_COLORS[colorKey];

        // highlighted 슬라이스 → 중각 방향으로 offset
        let translate = '';
        if (c.slice.highlighted) {
          const { dx, dy } = computeMidVector(c.startAngle, c.endAngle);
          const tx = dx * HIGHLIGHTED_OFFSET_PX;
          const ty = dy * HIGHLIGHTED_OFFSET_PX;
          translate = `translate(${tx} ${ty})`;
        }

        const d = computeSlice(c.startAngle, c.endAngle, cx, cy, outerRadius, effectiveInner);
        if (!d) return null;

        return (
          <path
            key={`slice-${c.index}`}
            d={d}
            fill={fill}
            stroke="#ffffff"
            strokeWidth={STROKE_WIDTH_BETWEEN}
            transform={translate || undefined}
          />
        );
      })}

      {/* 중앙 텍스트 (도넛만 — innerRadius > 0일 때 의미) */}
      {effectiveInner > 0 && centerText && (
        <text
          x={cx}
          y={cy + CENTER_TEXT_OFFSET}
          textAnchor="middle"
          fontSize={Math.max(14, effectiveInner * 0.35)}
          fontWeight={700}
          fill={CHART_TOKENS.fills.title}
        >
          {centerText}
        </text>
      )}
      {effectiveInner > 0 && centerSubtext && (
        <text
          x={cx}
          y={cy + CENTER_SUBTEXT_OFFSET}
          textAnchor="middle"
          fontSize={CHART_TOKENS.fontSize.subLabel}
          fill={CHART_TOKENS.fills.subLabel}
        >
          {centerSubtext}
        </text>
      )}

      {/* 외부 라벨 (작은 슬라이스는 자동 생략) */}
      {showLabels &&
        computed.map((c) => {
          if (c.ratio < SLICE_LABEL_OMIT_THRESHOLD) return null;

          // highlighted 슬라이스 라벨은 같이 이동
          let labelDx = 0;
          let labelDy = 0;
          if (c.slice.highlighted) {
            const { dx, dy } = computeMidVector(c.startAngle, c.endAngle);
            labelDx = dx * HIGHLIGHTED_OFFSET_PX;
            labelDy = dy * HIGHLIGHTED_OFFSET_PX;
          }

          const labelPos = computeLabelPosition(
            c.startAngle,
            c.endAngle,
            cx,
            cy,
            outerRadius + OUTER_LABEL_GAP_PX + LABEL_CONNECTOR_GAP,
          );
          const percent = (c.ratio * 100).toFixed(1);
          return (
            <g key={`label-${c.index}`} transform={`translate(${labelDx} ${labelDy})`}>
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor={labelPos.anchor}
                fontSize={CHART_TOKENS.fontSize.subLabel}
                fill={CHART_TOKENS.fills.header}
              >
                {c.slice.label}
                {showPercentages && ` ${percent}${unit}`}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

export type { DonutSlice } from './DonutChart.utils';
