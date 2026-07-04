'use client';

import { useEffect, useState } from 'react';

/**
 * 미니 한국 지도 — 사이클 Z (메인 지도 미리보기)
 *
 * price-map 과 동일한 /korea-provinces-geo.json 을 사용해 실제 시도
 * 지형 윤곽을 렌더한다 (블롭 근사 제거). 수도권(서울·인천·경기) 강조.
 * GeoJSON 은 브라우저 캐시 공유 — 모듈 캐시로 재파싱도 방지.
 */

interface GeoFeature {
  properties: { code: string; name: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}

// GeoJSON 자체 코드 기준 수도권 (서울 11 · 인천 23 · 경기 31)
const HIGHLIGHT = new Set(['11', '23', '31']);

interface Shape { code: string; d: string }

let cachedShapes: Shape[] | null = null;

const VIEW_W = 250;
const VIEW_H = 320;
const PAD = 10;
const SIMPLIFY_STEP = 3; // 미니 렌더 — 좌표 1/3 만 사용

function buildShapes(features: GeoFeature[]): Shape[] {
  // 전체 bounds
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const ringsOf = (f: GeoFeature): number[][][] => {
    if (f.geometry.type === 'Polygon') {
      return [(f.geometry.coordinates as number[][][])[0]];
    }
    return (f.geometry.coordinates as number[][][][]).map((poly) => poly[0]);
  };

  features.forEach((f) => {
    ringsOf(f).forEach((ring) => {
      ring.forEach(([lng, lat]) => {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
    });
  });

  const w = VIEW_W - PAD * 2;
  const h = VIEW_H - PAD * 2;
  const project = ([lng, lat]: number[]): string => {
    const x = PAD + ((lng - minLng) / (maxLng - minLng)) * w;
    const y = PAD + ((maxLat - lat) / (maxLat - minLat)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };

  return features.map((f) => {
    const d = ringsOf(f)
      .map((ring) => {
        const pts = ring.filter((_, i) => i % SIMPLIFY_STEP === 0 || i === ring.length - 1);
        return `M${pts.map(project).join('L')}Z`;
      })
      .join(' ');
    return { code: f.properties.code, d };
  });
}

export default function MiniKoreaMap() {
  const [shapes, setShapes] = useState<Shape[] | null>(cachedShapes);

  useEffect(() => {
    if (cachedShapes) return;
    let cancelled = false;
    fetch('/korea-provinces-geo.json')
      .then((r) => r.json())
      .then((geo) => {
        if (cancelled || !geo?.features) return;
        cachedShapes = buildShapes(geo.features);
        setShapes(cachedShapes);
      })
      .catch(() => { /* 지도는 장식 요소 — 실패 시 빈 배경 유지 */ });
    return () => { cancelled = true; };
  }, []);

  if (!shapes) {
    return <div aria-hidden style={{ width: '100%', height: '100%' }} />;
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden
    >
      {shapes.map((s) => {
        const highlighted = HIGHLIGHT.has(s.code);
        return (
          <path
            key={s.code}
            d={s.d}
            fill={highlighted ? 'var(--accent)' : '#C9D6EE'}
            opacity={highlighted ? 0.9 : 0.72}
            stroke="#FFFFFF"
            strokeWidth="0.8"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}
