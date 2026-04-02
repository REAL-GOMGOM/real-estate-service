'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { RegionChange } from '@/types/price-map';

interface KoreaMapProps {
  regions: RegionChange[];
  onRegionClick?: (region: RegionChange) => void;
  tradeType?: 'sale' | 'rent';
}

// GeoJSON code → API code 매핑 (시도)
const CODE_MAP: Record<string, string> = {
  '11': '11', '21': '26', '22': '27', '23': '28', '24': '29',
  '25': '30', '26': '31', '29': '36', '31': '41', '32': '42',
  '33': '43', '34': '44', '35': '45', '36': '46', '37': '47',
  '38': '48', '39': '50',
};

// API code → GeoJSON prefix 매핑 (역방향)
const API_TO_GEO: Record<string, string> = {};
for (const [geo, api] of Object.entries(CODE_MAP)) {
  API_TO_GEO[api] = geo;
}

const SHORT_NAMES: Record<string, string> = {
  '서울특별시': '서울', '부산광역시': '부산', '대구광역시': '대구',
  '인천광역시': '인천', '광주광역시': '광주', '대전광역시': '대전',
  '울산광역시': '울산', '세종특별자치시': '세종', '경기도': '경기',
  '강원도': '강원', '충청북도': '충북', '충청남도': '충남',
  '전라북도': '전북', '전라남도': '전남', '경상북도': '경북',
  '경상남도': '경남', '제주특별자치도': '제주',
};

function rateToColor(rate: number): string {
  if (rate <= -1.5) return '#1E40AF';
  if (rate <= -0.5) return '#60A5FA';
  if (rate <= -0.1) return '#93C5FD';
  if (rate < 0.1)   return 'var(--text-dim)';
  if (rate < 0.25)  return '#FCA5A5';
  if (rate < 0.5)   return '#F87171';
  return '#DC2626';
}

interface GeoFeature {
  type: string;
  properties: { code: string; name: string };
  geometry: { type: string; coordinates: number[][][][] | number[][][] };
}

function projectPoint(lng: number, lat: number, bounds: number[], width: number, height: number): [number, number] {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const padding = 30;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const x = padding + ((lng - minLng) / (maxLng - minLng)) * w;
  const y = padding + ((maxLat - lat) / (maxLat - minLat)) * h;
  return [x, y];
}

function coordsToPath(coords: number[][], bounds: number[], w: number, h: number): string {
  return coords.map((pt, i) => {
    const [x, y] = projectPoint(pt[0], pt[1], bounds, w, h);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join('') + 'Z';
}

function featureToPath(geometry: GeoFeature['geometry'], bounds: number[], w: number, h: number): string {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][]).map((ring) => coordsToPath(ring, bounds, w, h)).join('');
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).map((polygon) =>
      polygon.map((ring) => coordsToPath(ring, bounds, w, h)).join('')
    ).join('');
  }
  return '';
}

function getCentroid(geometry: GeoFeature['geometry']): [number, number] {
  let coords: number[][];
  if (geometry.type === 'Polygon') {
    coords = (geometry.coordinates as number[][][])[0];
  } else {
    const polys = geometry.coordinates as number[][][][];
    coords = polys.reduce((max, poly) => poly[0].length > max.length ? poly[0] : max, polys[0][0]);
  }
  let sumLng = 0, sumLat = 0;
  for (const pt of coords) { sumLng += pt[0]; sumLat += pt[1]; }
  return [sumLng / coords.length, sumLat / coords.length];
}

function getAllCoords(geometry: GeoFeature['geometry']): number[][] {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][]).flat();
  }
  return (geometry.coordinates as number[][][][]).flat(2);
}

function getBounds(features: GeoFeature[]): number[] {
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  for (const f of features) {
    for (const pt of getAllCoords(f.geometry)) {
      if (pt[0] < minLng) minLng = pt[0];
      if (pt[0] > maxLng) maxLng = pt[0];
      if (pt[1] < minLat) minLat = pt[1];
      if (pt[1] > maxLat) maxLat = pt[1];
    }
  }
  const padLng = (maxLng - minLng) * 0.1;
  const padLat = (maxLat - minLat) * 0.1;
  return [minLng - padLng, minLat - padLat, maxLng + padLng, maxLat + padLat];
}

interface DistrictData {
  name: string;
  change_rate: number;
  direction: 'up' | 'down' | 'flat';
}

export default function KoreaMap({ regions, onRegionClick, tradeType = 'sale' }: KoreaMapProps) {
  const [provinceGeo, setProvinceGeo] = useState<GeoFeature[] | null>(null);
  const [municipalGeo, setMunicipalGeo] = useState<GeoFeature[] | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  // 드릴다운 상태
  const [selectedProvince, setSelectedProvince] = useState<string | null>(null); // API code (11, 26, ...)
  const [districtData, setDistrictData] = useState<DistrictData[]>([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);

  const svgBaseWidth = 650;

  // GeoJSON 로드
  useEffect(() => {
    fetch('/korea-provinces-geo.json')
      .then((r) => r.json())
      .then((data) => setProvinceGeo(data.features))
      .catch(() => {});
    fetch('/korea-municipalities-geo.json')
      .then((r) => r.json())
      .then((data) => setMunicipalGeo(data.features))
      .catch(() => {});
  }, []);

  const rateMap = useMemo(() => {
    const map: Record<string, RegionChange> = {};
    for (const r of regions) map[r.code] = r;
    return map;
  }, [regions]);

  // 시도 클릭 → 구 데이터 fetch
  const handleProvinceClick = useCallback(async (apiCode: string) => {
    setSelectedProvince(apiCode);
    setLoadingDistricts(true);
    try {
      const res = await fetch(`/api/price-change/districts?province=${apiCode}&type=${tradeType}`);
      const json = await res.json();
      setDistrictData(json.districts || []);
    } catch {
      setDistrictData([]);
    } finally {
      setLoadingDistricts(false);
    }
  }, [tradeType]);

  // 뒤로가기
  const handleBack = () => {
    setSelectedProvince(null);
    setDistrictData([]);
  };

  // 현재 보여줄 features와 bounds
  const currentFeatures = useMemo(() => {
    if (selectedProvince && municipalGeo) {
      const geoPrefix = API_TO_GEO[selectedProvince] || selectedProvince;
      return municipalGeo.filter((f) => f.properties.code.startsWith(geoPrefix));
    }
    return provinceGeo || [];
  }, [selectedProvince, municipalGeo, provinceGeo]);

  const bounds = useMemo(() => {
    if (currentFeatures.length === 0) return [124.5, 33, 132, 39];
    return getBounds(currentFeatures);
  }, [currentFeatures]);

  // 실제 좌표 비율에 맞는 SVG 크기
  const lngRange = bounds[2] - bounds[0];
  const latRange = bounds[3] - bounds[1];
  // 위도 보정 (한국 위도 ~37도에서 경도 1도 ≈ 위도 0.8도)
  const correctedLng = lngRange * Math.cos((bounds[1] + bounds[3]) / 2 * Math.PI / 180);
  const aspect = correctedLng / latRange;
  const svgWidth = svgBaseWidth;
  const svgHeight = Math.round(svgBaseWidth / Math.max(aspect, 0.5));

  // 구 단위 변동률 매핑
  const districtRateMap = useMemo(() => {
    const map: Record<string, DistrictData> = {};
    for (const d of districtData) map[d.name] = d;
    return map;
  }, [districtData]);

  const provinceName = selectedProvince
    ? Object.entries(CODE_MAP).find(([, v]) => v === selectedProvince)?.[0]
    : null;

  if (!provinceGeo) {
    return (
      <div style={{ width: '100%', maxWidth: '700px', height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
        지도 로딩 중...
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* 뒤로가기 버튼 */}
      {selectedProvince && (
        <button
          onClick={handleBack}
          style={{
            position: 'absolute', top: '8px', left: '8px', zIndex: 10,
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '10px',
            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
          }}
        >
          <ArrowLeft size={14} />
          전국 보기
        </button>
      )}

      {loadingDistricts && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, color: 'var(--text-dim)', fontSize: '14px' }}>
          로딩 중...
        </div>
      )}

      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ width: '100%', minWidth: '500px', maxWidth: '800px', height: 'auto' }}>
        {currentFeatures.map((feature) => {
          const geoCode = feature.properties.code;
          const featureName = feature.properties.name;
          const isHovered = hoveredCode === geoCode;

          let rate = 0;
          let hasData = false;

          if (selectedProvince) {
            // 구 단위 모드
            const match = districtRateMap[featureName];
            if (match) {
              rate = match.change_rate;
              hasData = true;
            }
          } else {
            // 시도 모드
            const apiCode = CODE_MAP[geoCode];
            const data = apiCode ? rateMap[apiCode] : undefined;
            if (data) {
              rate = data.change_rate;
              hasData = true;
            }
          }

          const fill = hasData ? rateToColor(rate) : 'var(--border-light)';
          const pathD = featureToPath(feature.geometry, bounds, svgWidth, svgHeight);
          const [cLng, cLat] = getCentroid(feature.geometry);
          const [cx, cy] = projectPoint(cLng, cLat, bounds, svgWidth, svgHeight);
          const displayName = selectedProvince ? featureName : (SHORT_NAMES[featureName] || featureName);

          return (
            <g
              key={geoCode}
              onMouseEnter={() => setHoveredCode(geoCode)}
              onMouseLeave={() => setHoveredCode(null)}
              onClick={() => {
                if (!selectedProvince) {
                  const apiCode = CODE_MAP[geoCode];
                  if (apiCode) handleProvinceClick(apiCode);
                }
              }}
              style={{ cursor: selectedProvince ? 'default' : 'pointer' }}
            >
              <path
                d={pathD}
                fill={fill}
                stroke={isHovered ? 'var(--text-primary)' : 'var(--border)'}
                strokeWidth={isHovered ? 2 : 0.8}
                style={{ transition: 'fill 0.2s' }}
              />
              <text
                x={cx} y={cy - (hasData ? 6 : 0)}
                textAnchor="middle"
                fill="var(--text-primary)"
                fontSize={selectedProvince ? '8' : '10'}
                fontWeight="700"
                style={{ pointerEvents: 'none' }}
              >
                {displayName}
              </text>
              {hasData && (
                <text
                  x={cx} y={cy + 7}
                  textAnchor="middle"
                  fill={rate >= 0 ? 'var(--up-color)' : 'var(--down-color)'}
                  fontSize="8"
                  fontWeight="600"
                  fontFamily="Roboto Mono, monospace"
                  style={{ pointerEvents: 'none' }}
                >
                  {rate >= 0 ? '▲' : '▼'}{Math.abs(rate).toFixed(2)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
