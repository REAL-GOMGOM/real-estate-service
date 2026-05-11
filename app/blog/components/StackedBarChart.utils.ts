/**
 * StackedBarChart 순수 함수 모듈.
 *
 * 누적 좌표·percentMode 정규화·세그먼트 색상 해결 등 본체에서 분리.
 *
 * 레이아웃 모델 — vertical stacked bars (가로로 나란히 선 bar 여러 개, 각 bar는 세그먼트가 위로 누적):
 *   - bar.segments[0]은 bar 바닥부터 시작
 *   - bar.segments[i]는 cumOffset 만큼 위에서 시작
 *   - 모든 bar의 segments[j] (같은 index)는 같은 색상 → 비교 용이
 */

import { pickDefaultColor, type ColorKey } from '@/lib/chart-colors';

export interface StackedSegment {
  label: string;
  value: number;
  color?: ColorKey;
}

export interface StackedBar {
  label:    string;
  segments: StackedSegment[];
}

/** percentMode 정규화 후 데이터에 추가되는 누적 정보 */
export interface NormalizedSegment {
  /** 원본 segment 참조 */
  segment:   StackedSegment;
  /** 표시용 value (percentMode일 때는 % 단위로 정규화된 값, 아니면 raw) */
  displayValue: number;
  /** sanitized raw value (음수 0 처리 적용) */
  rawValue:  number;
  /** segment index (0-base) — 색상·legend 매핑용 */
  index:     number;
  /** 0..maxValue (bar 누적 합 또는 100) 범위에서 segment 시작점 */
  cumOffset: number;
}

export interface NormalizedBar {
  bar:       StackedBar;
  segments:  NormalizedSegment[];
  /** 모든 segment displayValue 합 (percentMode 시 보통 100, 아니면 raw 합) */
  total:     number;
  /** sanitize 이전 합 (음수 제외) — percentMode normalize 기준값 */
  rawTotal:  number;
}

/** 세그먼트 value sanitize — 음수는 0. */
export function sanitizeSegmentValue(value: number): number {
  if (Number.isFinite(value) && value > 0) return value;
  return 0;
}

/**
 * bars 정규화. 각 bar의 segments에 cumOffset 부여.
 *
 * percentMode=true: 각 bar의 segments value 합을 100으로 정규화 (rawTotal이 0이면 그대로 0).
 * percentMode=false: raw value 그대로.
 *
 * 음수 segment value는 0 처리 (dev mode 경고는 컴포넌트에서).
 */
export function normalizeBars(
  bars: StackedBar[],
  percentMode: boolean,
): NormalizedBar[] {
  return bars.map((bar) => {
    const sanitizedValues = bar.segments.map((s) => sanitizeSegmentValue(s.value));
    const rawTotal = sanitizedValues.reduce((a, b) => a + b, 0);

    const scale = percentMode && rawTotal > 0 ? 100 / rawTotal : 1;
    let cursor = 0;
    const segments: NormalizedSegment[] = bar.segments.map((segment, i) => {
      const rawValue = sanitizedValues[i];
      const displayValue = rawValue * scale;
      const cumOffset = cursor;
      cursor += displayValue;
      return { segment, rawValue, displayValue, index: i, cumOffset };
    });

    return {
      bar,
      segments,
      total:    percentMode && rawTotal > 0 ? 100 : rawTotal,
      rawTotal,
    };
  });
}

/**
 * 세그먼트 색상 결정 (category intent)
 * - segment.color 명시 시 그대로 사용
 * - 미명시 시 pickDefaultColor(index, 'category') → red 시작
 */
export function resolveSegmentColor(
  segment: StackedSegment,
  segmentIndex: number,
): ColorKey {
  if (segment.color) return segment.color;
  return pickDefaultColor(segmentIndex, 'category');
}

/** 모든 bar의 (정규화 이후) total 중 max 값. y축 도메인. */
export function computeChartMax(normalized: NormalizedBar[]): number {
  if (normalized.length === 0) return 0;
  return Math.max(...normalized.map((n) => n.total));
}

/**
 * legend 항목 — bars[0]의 segments 순서. 모든 bar가 같은 segment 구조라고 가정.
 * 만약 bars 별로 segments 수가 다르면, 모든 bar에서 등장하는 index 합집합 기준.
 */
export function buildLegendEntries(bars: StackedBar[]): Array<{
  label: string;
  index: number;
}> {
  const maxLen = bars.reduce((acc, b) => Math.max(acc, b.segments.length), 0);
  const labels: Array<{ label: string; index: number } | null> = Array.from({ length: maxLen }, () => null);
  for (const bar of bars) {
    bar.segments.forEach((seg, i) => {
      if (labels[i] === null) labels[i] = { label: seg.label, index: i };
    });
  }
  return labels.filter((x): x is { label: string; index: number } => x !== null);
}

/** ariaDesc 자동 생성 — bar 수·세그먼트 개수·예시 1건. */
export function generateAriaDesc(bars: StackedBar[]): string {
  if (bars.length === 0) return '데이터가 없는 빈 누적 막대 차트';
  const segLen = bars[0]?.segments.length ?? 0;
  const sample = bars[0];
  const sampleSummary = sample
    ? `${sample.label}: ${sample.segments
        .map((s) => `${s.label} ${sanitizeSegmentValue(s.value)}`)
        .join(', ')}`
    : '';
  return `${bars.length}개 막대, 각 ${segLen}개 세그먼트. ${sampleSummary}`;
}
