/**
 * DonutChart 순수 함수 모듈.
 *
 * SVG arc path 생성, 라벨 위치, 슬라이스 정규화 등 본체에서 분리해 단위 테스트 가능.
 *
 * 각도 시스템:
 * - 슬라이스 진행 방향은 12시 시작·시계방향
 * - 내부 라디안: 0이 12시, π/2가 3시 (시계방향 양의 방향)
 * - SVG 좌표 변환에서 -π/2 회전 적용
 */

import { resolveChartColor, type ChartColor } from '@/lib/chart-colors';

export interface DonutSlice {
  label:        string;
  value:        number;
  /** 사이클 S Step S-1: ColorKey → ChartColor (hex 코드 입력 허용) */
  color?:       ChartColor;
  highlighted?: boolean;
}

/** 작은 슬라이스 라벨 자동 생략 임계값 (전체 대비 %) */
export const SLICE_LABEL_OMIT_THRESHOLD = 0.05; // 5%
/** highlighted 슬라이스가 외부로 이동하는 거리 (px) */
export const HIGHLIGHTED_OFFSET_PX = 8;
/** 외부 라벨이 호 바깥쪽으로 떨어지는 거리 (px) */
export const OUTER_LABEL_GAP_PX = 12;

/** 폴라 → 카타시안 (cx, cy 중심, 12시=0 기준) */
function polar(cx: number, cy: number, r: number, angle: number) {
  const a = angle - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/**
 * 도넛 슬라이스 SVG path d 속성.
 * - innerRadius = 0 → Pie 슬라이스 (M cx cy → L outerStart → A → Z)
 * - 슬라이스 전체(360°) → 두 개의 반원 arc로 분할 (single arc는 SVG에서 0길이로 처리됨)
 *
 * @param startAngle 시작각 (라디안, 12시=0 시계방향 양의 방향)
 * @param endAngle   끝각
 */
export function computeSlice(
  startAngle: number,
  endAngle: number,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep <= 0) return '';

  // 360° 단일 슬라이스: 두 반원으로 분할
  const isFullCircle = sweep >= Math.PI * 2 - 1e-6;
  if (isFullCircle) {
    const half = startAngle + Math.PI;
    if (innerRadius > 0) {
      // 도넛 — 외부 원 + 내부 원 (역방향)
      const o1 = polar(cx, cy, outerRadius, startAngle);
      const o2 = polar(cx, cy, outerRadius, half);
      const i1 = polar(cx, cy, innerRadius, startAngle);
      const i2 = polar(cx, cy, innerRadius, half);
      return [
        `M ${o1.x} ${o1.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${o2.x} ${o2.y}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${o1.x} ${o1.y}`,
        `M ${i1.x} ${i1.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${i2.x} ${i2.y}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${i1.x} ${i1.y}`,
        'Z',
      ].join(' ');
    }
    // Pie 전체 — 단일 circle path
    const o1 = polar(cx, cy, outerRadius, startAngle);
    const o2 = polar(cx, cy, outerRadius, half);
    return [
      `M ${o1.x} ${o1.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${o2.x} ${o2.y}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${o1.x} ${o1.y}`,
      'Z',
    ].join(' ');
  }

  const largeArcFlag = sweep > Math.PI ? 1 : 0;
  const outerStart = polar(cx, cy, outerRadius, startAngle);
  const outerEnd   = polar(cx, cy, outerRadius, endAngle);

  if (innerRadius <= 0) {
    // Pie 슬라이스
    return [
      `M ${cx} ${cy}`,
      `L ${outerStart.x} ${outerStart.y}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
      'Z',
    ].join(' ');
  }

  // 도넛 슬라이스
  const innerEnd   = polar(cx, cy, innerRadius, endAngle);
  const innerStart = polar(cx, cy, innerRadius, startAngle);
  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}

/**
 * 슬라이스 중각 방향 unit vector.
 * highlighted 슬라이스 외부 이동·라벨 연결선에 사용.
 */
export function computeMidVector(startAngle: number, endAngle: number) {
  const mid = (startAngle + endAngle) / 2;
  const a = mid - Math.PI / 2;
  return { dx: Math.cos(a), dy: Math.sin(a), midAngle: mid };
}

/**
 * 외부 라벨 위치 계산.
 * @param radius 라벨이 떨어질 호 바깥 반지름 (outerRadius + OUTER_LABEL_GAP_PX 권장)
 */
export function computeLabelPosition(
  startAngle: number,
  endAngle: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const { midAngle } = computeMidVector(startAngle, endAngle);
  const p = polar(cx, cy, radius, midAngle);
  // mid 각도에 따라 textAnchor 결정
  // 각도(시계방향, 12시=0) 0~π: 우측 → 'start'; π~2π: 좌측 → 'end'
  const normalized = ((midAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let anchor: 'start' | 'middle' | 'end';
  if (normalized < 0.1 || normalized > Math.PI * 2 - 0.1) {
    anchor = 'middle';
  } else if (normalized < Math.PI - 0.1) {
    anchor = 'start';
  } else if (normalized < Math.PI + 0.1) {
    anchor = 'middle';
  } else {
    anchor = 'end';
  }
  return { x: p.x, y: p.y, anchor };
}

/**
 * 슬라이스별 색상 결정 — 사이클 S Step S-1에서 resolveChartColor wrapper로 변환.
 *
 * 우선순위:
 *   1. slice.color hex 코드 → 그대로
 *   2. slice.color 키워드 → CHART_COLORS 매핑
 *   3. 미지정/잘못된 값 → pickDefaultColor(index, 'category') — red 시작
 *
 * 반환값은 SVG fill에 직접 사용 가능한 hex string.
 */
export function resolveSliceColor(
  slice: DonutSlice,
  sliceIndex: number,
): string {
  return resolveChartColor(slice.color, sliceIndex, 'category');
}

/**
 * 슬라이스 데이터 → 각도 매핑 계산.
 * 음수 value는 0 처리 (dev mode 경고는 컴포넌트에서).
 * value 합계 0이면 빈 결과 반환.
 */
export interface ComputedSlice {
  slice:       DonutSlice;
  index:       number;
  value:       number;        // sanitized (>= 0)
  ratio:       number;        // 0..1
  startAngle:  number;
  endAngle:    number;
}

export function computeSliceLayout(data: DonutSlice[]): ComputedSlice[] {
  const sanitized = data.map((s) => Math.max(0, s.value));
  const total = sanitized.reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  let cursor = 0;
  return data.map((slice, i) => {
    const ratio = sanitized[i] / total;
    const startAngle = cursor;
    const endAngle = cursor + ratio * Math.PI * 2;
    cursor = endAngle;
    return { slice, index: i, value: sanitized[i], ratio, startAngle, endAngle };
  });
}

/** ariaDesc 자동 생성 — 슬라이스 수·상위 항목 요약. */
export function generateAriaDesc(data: DonutSlice[]): string {
  const sanitized = data.map((s) => ({ label: s.label, value: Math.max(0, s.value) }));
  const total = sanitized.reduce((a, b) => a + b.value, 0);
  if (total === 0 || sanitized.length === 0) return '데이터가 없는 빈 도넛 차트';

  const top = [...sanitized]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((s) => `${s.label} ${((s.value / total) * 100).toFixed(1)}%`)
    .join(', ');

  return `${data.length}개 슬라이스. 상위 ${Math.min(3, data.length)}개: ${top}.`;
}
