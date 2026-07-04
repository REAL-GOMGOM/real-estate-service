/**
 * SVG 곡선 스무딩 유틸 — 사이클 Z (그래프 폴리싱)
 *
 * Catmull-Rom 스플라인을 cubic bezier 로 변환해 꺾은선을 부드러운
 * 곡선 path 로 만든다. 실거래 스파크라인의 지그재그 완화용.
 */

export interface Pt { x: number; y: number }

/** 점 목록 → 부드러운 SVG path (M...C...) */
export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  if (pts.length === 2) {
    return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  }

  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** 라인 path + 하단 채움 영역 path (스파크 카드용) */
export function smoothAreaPath(pts: Pt[], width: number, height: number): string {
  if (pts.length < 2) return '';
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L${last.x.toFixed(1)},${height} L${first.x.toFixed(1)},${height} Z`;
}
