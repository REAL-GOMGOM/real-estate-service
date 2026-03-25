'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { LocationScore, KakaoMap as KakaoMapType } from '@/lib/types';
import { getScoreColor } from './LocationSidebar';

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
}

// 이 레벨 이상이면 시 단위 표시
const CITY_LEVEL_THRESHOLD = 10;

function createMarkerElement(loc: LocationScore, onClick: () => void): HTMLDivElement {
  const color      = getScoreColor(loc.score);
  const trendIcon  = loc.trend === 'up' ? '▲' : loc.trend === 'down' ? '▼' : '—';
  const trendColor = loc.trend === 'up' ? '#22C55E' : loc.trend === 'down' ? '#EF4444' : '#64748B';

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

  // 토허제 빨간 점
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

type OverlayRef = { setMap: (m: KakaoMapType | null) => void };

export default function KakaoMap({ locations, onMarkerClick, selectedLocation, mapConfig }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<KakaoMapType | null>(null);
  const cityOverlaysRef     = useRef<OverlayRef[]>([]);
  const districtOverlaysRef = useRef<OverlayRef[]>([]);
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

    const handler = () => { if (mapRef.current) applyZoomLevel(mapRef.current); };
    zoomHandlerRef.current = handler;
    window.kakao.maps.event.addListener(mapRef.current, 'zoom_changed', handler);
  }, []);

  // locations 변경 시 마커 재생성
  useEffect(() => {
    if (mapRef.current) renderMarkers();
  }, [renderMarkers]);

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
      if (mapRef.current && zoomHandlerRef.current) {
        window.kakao.maps.event.removeListener(mapRef.current, 'zoom_changed', zoomHandlerRef.current);
      }
    };
  }, []);

  return (
    <div ref={mapContainerRef} style={{ flex: 1, height: 'calc(100vh - 64px)', width: '100%' }} />
  );
}
