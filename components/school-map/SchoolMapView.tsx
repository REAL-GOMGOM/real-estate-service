'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SchoolInfo } from '@/types/school-map';
import { SCHOOL_TYPE_MAP } from '@/types/school-map';

interface SchoolMapViewProps {
  schools: SchoolInfo[];
  onSchoolClick?: (school: SchoolInfo) => void;
}

const MARKER_COLORS: Record<string, string> = {
  elementary: '#22C55E',
  middle: '#3B82F6',
  high: '#F97316',
};

function createMarkerIcon(type: string): L.DivIcon {
  const color = MARKER_COLORS[type] || 'var(--text-muted)';
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="
      width:24px; height:24px; border-radius:50%;
      background:${color}; border:2px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
  });
}

export default function SchoolMapView({ schools, onSchoolClick }: SchoolMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // 지도 초기화
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    leafletMap.current = L.map(mapRef.current, {
      center: [37.5065, 127.0530], // 강남 중심
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(leafletMap.current);

    markersRef.current = L.layerGroup().addTo(leafletMap.current);

    return () => {
      leafletMap.current?.remove();
      leafletMap.current = null;
    };
  }, []);

  // 마커 업데이트
  useEffect(() => {
    if (!leafletMap.current || !markersRef.current) return;

    markersRef.current.clearLayers();

    for (const school of schools) {
      const marker = L.marker([school.lat, school.lng], {
        icon: createMarkerIcon(school.type),
      });

      const typeInfo = SCHOOL_TYPE_MAP[school.type];
      marker.bindPopup(`
        <div style="font-family:Pretendard,sans-serif; min-width:180px;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
            <span style="
              padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;
              background:${typeInfo.color}22; color:${typeInfo.color};
            ">${typeInfo.label}</span>
          </div>
          <p style="font-size:14px; font-weight:700; margin-bottom:4px;">${school.name}</p>
          <p style="font-size:12px; color:#666; margin-bottom:2px;">${school.address}</p>
          ${school.studentCount ? `<p style="font-size:12px; color:#888;">학생 수: ${school.studentCount.toLocaleString()}명</p>` : ''}
        </div>
      `, { className: 'school-popup' });

      marker.on('click', () => onSchoolClick?.(school));
      marker.addTo(markersRef.current!);
    }

    // 마커가 있으면 맵 bounds 조정
    if (schools.length > 0) {
      const bounds = L.latLngBounds(schools.map((s) => [s.lat, s.lng]));
      leafletMap.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [schools, onSchoolClick]);

  return (
    <div
      ref={mapRef}
      style={{
        width: '100%', height: '600px', borderRadius: '14px',
        border: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    />
  );
}
