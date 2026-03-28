'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { LocationScore, KakaoMap as KakaoMapType } from '@/lib/types';
import { getScoreColor } from './LocationSidebar';
import type { SchoolData } from './SchoolDetailPanel';

interface MapConfig {
  lat: number;
  lng: number;
  level: number;
}

interface Props {
  locations: LocationScore[];
  onMarkerClick: (location: LocationScore) => void;
  selectedLocation: LocationScore | null;
  mapConfig: MapConfig;
  schools?: SchoolData[];
  activeLayers?: Set<string>;
  onSchoolClick?: (school: SchoolData) => void;
}

// 이 레벨 이상이면 시 단위 표시
const CITY_LEVEL_THRESHOLD = 10;
// 학교 마커는 이 줌 레벨 이하에서만 표시 (충분히 줌인했을 때)
const SCHOOL_ZOOM_THRESHOLD = 7;

const SCHOOL_COLORS: Record<string, string> = {
  elementary: '#22C55E',
  middle: '#3B82F6',
  high: '#F97316',
};

const SCHOOL_LABELS: Record<string, string> = {
  elementary: '초',
  middle: '중',
  high: '고',
};

function createMarkerElement(loc: LocationScore, onClick: () => void): HTMLDivElement {
  const color      = getScoreColor(loc.score);
  const trendIcon  = loc.trend === 'up' ? '▲' : loc.trend === 'down' ? '▼' : '—';
  const trendColor = loc.trend === 'up' ? '#22C55E' : loc.trend === 'down' ? '#EF4444' : 'var(--text-dim)';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;';

  const box = document.createElement('div');
  box.style.cssText = `
    padding: 5px 9px;
    border-radius: 8px;
    background: rgba(15,22,41,0.95);
    border: 1.5px solid ${color};
    backdrop-filter: blur(8px);
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0,0,0,0.35);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 44px;
    position: relative;
  `;

  if (loc.isToheo) {
    const dot = document.createElement('div');
    dot.style.cssText = `
      position: absolute; top: -3px; right: -3px;
      width: 7px; height: 7px; border-radius: 50%;
      background: #EF4444;
      border: 1.5px solid rgba(15,22,41,0.95);
    `;
    box.appendChild(dot);
  }

  const nameEl = document.createElement('span');
  nameEl.style.cssText = 'font-size:11px;font-weight:700;color:#F1F5F9;font-family:Pretendard,sans-serif;letter-spacing:-0.3px;';
  nameEl.textContent = loc.name;

  const scoreRow = document.createElement('div');
  scoreRow.style.cssText = 'display:flex;align-items:center;gap:3px;';

  const scoreEl = document.createElement('span');
  scoreEl.style.cssText = `font-size:12px;font-weight:800;color:${color};font-family:'Roboto Mono',monospace;`;
  scoreEl.textContent = loc.score.toFixed(1);

  const trendEl = document.createElement('span');
  trendEl.style.cssText = `font-size:8px;font-weight:700;color:${trendColor};`;
  trendEl.textContent = trendIcon;

  scoreRow.appendChild(scoreEl);
  scoreRow.appendChild(trendEl);
  box.appendChild(nameEl);
  box.appendChild(scoreRow);

  const tail = document.createElement('div');
  tail.style.cssText = `width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${color};`;

  wrapper.appendChild(box);
  wrapper.appendChild(tail);
  wrapper.addEventListener('click', onClick);
  return wrapper;
}

function createSchoolMarkerElement(school: SchoolData, onClick: () => void): HTMLDivElement {
  const color = SCHOOL_COLORS[school.school_level] || '#3B82F6';
  const label = SCHOOL_LABELS[school.school_level] || '학';
  const gradeText = school.grade ? `${school.grade}등급` : '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;';

  const box = document.createElement('div');
  box.style.cssText = `
    padding: 3px 7px;
    border-radius: 6px;
    background: ${color};
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    gap: 4px;
  `;

  const iconEl = document.createElement('span');
  iconEl.style.cssText = 'font-size:11px;font-weight:800;color:white;font-family:Pretendard,sans-serif;';
  iconEl.textContent = `🏫 ${label}`;
  box.appendChild(iconEl);

  if (gradeText) {
    const gradeEl = document.createElement('span');
    gradeEl.style.cssText = `
      font-size:10px;font-weight:800;color:white;
      background:rgba(0,0,0,0.25);padding:1px 5px;border-radius:4px;
      font-family:'Roboto Mono',monospace;
    `;
    gradeEl.textContent = gradeText;
    box.appendChild(gradeEl);
  }

  // 학교명 (줌인 시에만 보이므로 간략 표시)
  const nameEl = document.createElement('div');
  nameEl.style.cssText = 'font-size:9px;font-weight:600;color:white;text-align:center;margin-top:1px;text-shadow:0 1px 3px rgba(0,0,0,0.5);';
  nameEl.textContent = school.name.replace(/서울|학교$/g, '').trim();

  const tail = document.createElement('div');
  tail.style.cssText = `width:0;height:0;border-left:3px solid transparent;border-right:3px solid transparent;border-top:4px solid ${color};`;

  wrapper.appendChild(box);
  wrapper.appendChild(nameEl);
  wrapper.appendChild(tail);
  wrapper.addEventListener('click', onClick);
  return wrapper;
}

type OverlayRef = { setMap: (m: KakaoMapType | null) => void };

export default function KakaoMap({
  locations, onMarkerClick, selectedLocation, mapConfig,
  schools = [], activeLayers, onSchoolClick,
}: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<KakaoMapType | null>(null);
  const cityOverlaysRef     = useRef<OverlayRef[]>([]);
  const districtOverlaysRef = useRef<OverlayRef[]>([]);
  const schoolOverlaysRef   = useRef<OverlayRef[]>([]);
  const zoomHandlerRef      = useRef<(() => void) | null>(null);
  const prevMapConfigRef    = useRef<MapConfig | null>(null);

  const cityLocations     = locations.filter((l) => l.level === 'city');
  const districtLocations = locations.filter((l) => l.level === 'district');

  const createOverlays = useCallback((
    locs: LocationScore[],
    map: KakaoMapType,
    visible: boolean,
  ): OverlayRef[] => {
    return locs.map((loc) => {
      const position = new window.kakao.maps.LatLng(loc.lat, loc.lng);
      const content  = createMarkerElement(loc, () => onMarkerClick(loc));
      return new window.kakao.maps.CustomOverlay({
        position, content, yAnchor: 1.05, zIndex: 3,
        map: visible ? map : null,
      });
    });
  }, [onMarkerClick]);

  const applyZoomLevel = useCallback((map: KakaoMapType) => {
    const zoomLevel = map.getLevel();
    const showCity  = zoomLevel >= CITY_LEVEL_THRESHOLD;
    cityOverlaysRef.current.forEach((o) => o.setMap(showCity ? map : null));
    districtOverlaysRef.current.forEach((o) => o.setMap(showCity ? null : map));

    // 학교 마커: 충분히 줌인했을 때만 표시
    const showSchools = zoomLevel <= SCHOOL_ZOOM_THRESHOLD;
    schoolOverlaysRef.current.forEach((o) => o.setMap(showSchools ? map : null));
  }, []);

  const renderMarkers = useCallback(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    cityOverlaysRef.current.forEach((o) => o.setMap(null));
    districtOverlaysRef.current.forEach((o) => o.setMap(null));

    const showCity = map.getLevel() >= CITY_LEVEL_THRESHOLD;
    cityOverlaysRef.current     = createOverlays(cityLocations,     map, showCity);
    districtOverlaysRef.current = createOverlays(districtLocations, map, !showCity);
  }, [cityLocations, districtLocations, createOverlays]);

  // 학교 마커 렌더링
  const renderSchoolMarkers = useCallback(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const map = mapRef.current;

    // 기존 학교 마커 제거
    schoolOverlaysRef.current.forEach((o) => o.setMap(null));
    schoolOverlaysRef.current = [];

    if (!activeLayers || activeLayers.size === 0) return;

    const filtered = schools.filter((s) => activeLayers.has(s.school_level));
    const showSchools = map.getLevel() <= SCHOOL_ZOOM_THRESHOLD;

    schoolOverlaysRef.current = filtered.map((school) => {
      const position = new window.kakao.maps.LatLng(school.latitude, school.longitude);
      const content = createSchoolMarkerElement(school, () => onSchoolClick?.(school));
      return new window.kakao.maps.CustomOverlay({
        position, content, yAnchor: 1.2, zIndex: 5,
        map: showSchools ? map : null,
      });
    });
  }, [schools, activeLayers, onSchoolClick]);

  // 최초 초기화
  useEffect(() => {
    if (!mapContainerRef.current || !window.kakao?.maps) return;

    const center = new window.kakao.maps.LatLng(mapConfig.lat, mapConfig.lng);
    mapRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
      center,
      level: mapConfig.level,
    });
    prevMapConfigRef.current = mapConfig;

    renderMarkers();
    renderSchoolMarkers();

    const handler = () => { if (mapRef.current) applyZoomLevel(mapRef.current); };
    zoomHandlerRef.current = handler;
    window.kakao.maps.event.addListener(mapRef.current, 'zoom_changed', handler);
  }, []);

  // locations 변경 시 마커 재생성
  useEffect(() => {
    if (mapRef.current) renderMarkers();
  }, [renderMarkers]);

  // 학교 데이터/레이어 변경 시 학교 마커 재생성
  useEffect(() => {
    if (mapRef.current) renderSchoolMarkers();
  }, [renderSchoolMarkers]);

  // 권역 변경 시 지도 중심·레벨 이동
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const prev = prevMapConfigRef.current;
    if (prev?.lat === mapConfig.lat && prev?.lng === mapConfig.lng) return;

    const center = new window.kakao.maps.LatLng(mapConfig.lat, mapConfig.lng);
    mapRef.current.setCenter(center);
    prevMapConfigRef.current = mapConfig;
  }, [mapConfig]);

  // 선택 지역으로 이동
  useEffect(() => {
    if (!selectedLocation || !mapRef.current || !window.kakao?.maps) return;
    const position = new window.kakao.maps.LatLng(selectedLocation.lat, selectedLocation.lng);
    mapRef.current.setCenter(position);
  }, [selectedLocation]);

  // cleanup
  useEffect(() => {
    return () => {
      cityOverlaysRef.current.forEach((o) => o.setMap(null));
      districtOverlaysRef.current.forEach((o) => o.setMap(null));
      schoolOverlaysRef.current.forEach((o) => o.setMap(null));
      if (mapRef.current && zoomHandlerRef.current) {
        window.kakao.maps.event.removeListener(mapRef.current, 'zoom_changed', zoomHandlerRef.current);
      }
    };
  }, []);

  return (
    <div ref={mapContainerRef} style={{ flex: 1, height: 'calc(100vh - 64px)', width: '100%' }} />
  );
}
