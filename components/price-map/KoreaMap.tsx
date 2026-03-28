'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { RegionChange } from '@/types/price-map';

interface KoreaMapProps {
  regions: RegionChange[];
  onRegionClick?: (region: RegionChange) => void;
}

// GeoJSON code → API code 매핑
const CODE_MAP: Record<string, string> = {
  '11': '11', // 서울
  '21': '26', // 부산
  '22': '27', // 대구
  '23': '28', // 인천
  '24': '29', // 광주
  '25': '30', // 대전
  '26': '31', // 울산
  '29': '36', // 세종
  '31': '41', // 경기
  '32': '42', // 강원
  '33': '43', // 충북
  '34': '44', // 충남
  '35': '45', // 전북
  '36': '46', // 전남
  '37': '47', // 경북
  '38': '48', // 경남
  '39': '50', // 제주
};

// 시도별 약칭
const SHORT_NAMES: Record<string, string> = {
  '서울특별시': '서울',
  '부산광역시': '부산',
  '대구광역시': '대구',
  '인천광역시': '인천',
  '광주광역시': '광주',
  '대전광역시': '대전',
  '울산광역시': '울산',
  '세종특별자치시': '세종',
  '경기도': '경기',
  '강원도': '강원',
  '충청북도': '충북',
  '충청남도': '충남',
  '전라북도': '전북',
  '전라남도': '전남',
  '경상북도': '경북',
  '경상남도': '경남',
  '제주특별자치도': '제주',
};

function rateToColor(rate: number): string {
  if (rate <= -1.5) return '#1E40AF';
  if (rate <= -0.5) return '#60A5FA';
  if (rate <= -0.1) return '#93C5FD';
  if (rate < 0.1)   return '#94A3B8';
  if (rate < 0.25)  return '#FCA5A5';
  if (rate < 0.5)   return '#F87171';
  return '#DC2626';
}

interface GeoFeature {
  type: string;
  properties: { code: string; name: string };
  geometry: { type: string; coordinates: number[][][][] | number[][][] };
}

function projectPoint(lng: number, lat: number, width: number, height: number): [number, number] {
  // 한국 경위도 범위
  const minLng = 124.5, maxLng = 132.0;
  const minLat = 33.0, maxLat = 39.0;
  const padding = 20;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const x = padding + ((lng - minLng) / (maxLng - minLng)) * w;
  const y = padding + ((maxLat - lat) / (maxLat - minLat)) * h;
  return [x, y];
}

function coordsToPath(coords: number[][], w: number, h: number): string {
  return coords.map((pt, i) => {
    const [x, y] = projectPoint(pt[0], pt[1], w, h);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join('') + 'Z';
}

function featureToPath(geometry: GeoFeature['geometry'], w: number, h: number): string {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][]).map((ring) => coordsToPath(ring, w, h)).join('');
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).map((polygon) =>
      polygon.map((ring) => coordsToPath(ring, w, h)).join('')
    ).join('');
  }
  return '';
}

function getCentroid(geometry: GeoFeature['geometry']): [number, number] {
  let coords: number[][];
  if (geometry.type === 'Polygon') {
    coords = (geometry.coordinates as number[][][])[0];
  } else {
    // MultiPolygon: 가장 큰 폴리곤 사용
    const polys = geometry.coordinates as number[][][][];
    coords = polys.reduce((max, poly) => poly[0].length > max.length ? poly[0] : max, polys[0][0]);
  }
  let sumLng = 0, sumLat = 0;
  for (const pt of coords) { sumLng += pt[0]; sumLat += pt[1]; }
  return [sumLng / coords.length, sumLat / coords.length];
}

export default function KoreaMap({ regions, onRegionClick }: KoreaMapProps) {
  const [geoData, setGeoData] = useState<GeoFeature[] | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const svgWidth = 500;
  const svgHeight = 600;

  useEffect(() => {
    fetch('/korea-provinces-geo.json')
      .then((r) => r.json())
      .then((data) => setGeoData(data.features))
      .catch(() => setGeoData(null));
  }, []);

  const rateMap = useMemo(() => {
    const map: Record<string, RegionChange> = {};
    for (const r of regions) map[r.code] = r;
    return map;
  }, [regions]);

  if (!geoData) {
    return (
      <div style={{ width: '100%', maxWidth: '500px', height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}>
        지도 로딩 중...
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', maxWidth: '500px', height: 'auto' }}>
      {geoData.map((feature) => {
        const geoCode = feature.properties.code;
        const apiCode = CODE_MAP[geoCode];
        const data = apiCode ? rateMap[apiCode] : undefined;
        const rate = data?.change_rate ?? 0;
        const fill = rateToColor(rate);
        const isHovered = hoveredCode === geoCode;
        const shortName = SHORT_NAMES[feature.properties.name] || feature.properties.name;
        const pathD = featureToPath(feature.geometry, svgWidth, svgHeight);
        const [cLng, cLat] = getCentroid(feature.geometry);
        const [cx, cy] = projectPoint(cLng, cLat, svgWidth, svgHeight);

        return (
          <g
            key={geoCode}
            onMouseEnter={() => setHoveredCode(geoCode)}
            onMouseLeave={() => setHoveredCode(null)}
            onClick={() => data && onRegionClick?.(data)}
            style={{ cursor: data ? 'pointer' : 'default' }}
          >
            <path
              d={pathD}
              fill={fill}
              stroke={isHovered ? '#FFFFFF' : 'rgba(255,255,255,0.3)'}
              strokeWidth={isHovered ? 2 : 0.8}
              style={{ transition: 'fill 0.2s' }}
            />
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              fill="#F1F5F9"
              fontSize="11"
              fontWeight="700"
              style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
            >
              {shortName}
            </text>
            {data && (
              <text
                x={cx}
                y={cy + 8}
                textAnchor="middle"
                fill={rate >= 0 ? '#FCA5A5' : '#93C5FD'}
                fontSize="10"
                fontWeight="600"
                fontFamily="Roboto Mono, monospace"
                style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
              >
                {rate >= 0 ? '▲' : '▼'}{Math.abs(rate).toFixed(2)}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
