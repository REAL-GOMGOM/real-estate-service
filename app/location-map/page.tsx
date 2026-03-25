'use client';

import { useState, useMemo, useEffect } from 'react';
import Header from '@/components/layout/Header';
import KakaoMap from '@/components/location-map/KakaoMap';
import LocationSidebar from '@/components/location-map/LocationSidebar';
import LocationDetailPanel from '@/components/location-map/LocationDetailPanel';
import type { LocationScore } from '@/lib/types';

const ALL_LOCATIONS: LocationScore[] = require('@/data/location-scores.json');

export default function LocationMapPage() {
  const [selectedRegion, setSelectedRegion] = useState<string>('전체');
  const [selectedLocation, setSelectedLocation] = useState<LocationScore | null>(null);
  const [showToheoOnly, setShowToheoOnly] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.kakao?.maps) { setMapReady(true); return; }

    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_MAP_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => setMapReady(true));
    script.onerror = () => console.error('카카오맵 SDK 로드 실패');
    document.head.appendChild(script);

    return () => {
      const el = document.querySelector('script[src*="dapi.kakao.com"]');
      if (el) el.remove();
    };
  }, []);

  const filteredLocations = useMemo(() => {
    return ALL_LOCATIONS.filter((l) => {
      const regionMatch = selectedRegion === '전체' || l.region === selectedRegion;
      const toheoMatch  = !showToheoOnly || l.isToheo;
      return regionMatch && toheoMatch;
    });
  }, [selectedRegion, showToheoOnly]);

  const mapConfig = useMemo(() => {
    switch (selectedRegion) {
      case '서울':      return { lat: 37.5326, lng: 126.9997, level: 9  };
      case '경기':      return { lat: 37.4500, lng: 127.1500, level: 10 };
      case '인천':      return { lat: 37.4563, lng: 126.7052, level: 10 };
      case '1기신도시': return { lat: 37.4800, lng: 126.9500, level: 10 };
      case '2기신도시': return { lat: 37.3000, lng: 127.0000, level: 10 };
      case '3기신도시': return { lat: 37.5000, lng: 127.0500, level: 10 };
      case '부산':      return { lat: 35.1796, lng: 129.0756, level: 10 };
      case '대구':      return { lat: 35.8714, lng: 128.6014, level: 10 };
      case '울산':      return { lat: 35.5384, lng: 129.3114, level: 10 };
      default:          return { lat: 36.5000, lng: 127.8000, level: 13 };
    }
  }, [selectedRegion]);

  return (
    <>
      <Header />
      <div style={{ display: 'flex', paddingTop: '64px' }}>
        <LocationSidebar
          allLocations={ALL_LOCATIONS}
          filteredLocations={filteredLocations}
          selectedRegion={selectedRegion}
          showToheoOnly={showToheoOnly}
          onRegionChange={setSelectedRegion}
          onToheoToggle={setShowToheoOnly}
          onLocationClick={setSelectedLocation}
        />

        <div style={{ position: 'relative', flex: 1 }}>
          {mapReady ? (
            <KakaoMap
              locations={filteredLocations}
              onMarkerClick={setSelectedLocation}
              selectedLocation={selectedLocation}
              mapConfig={mapConfig}
            />
          ) : (
            <div style={{
              height: 'calc(100vh - 64px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#0A0E1A', color: '#475569', fontSize: '14px',
            }}>
              지도를 불러오는 중...
            </div>
          )}

          {selectedLocation && (
            <LocationDetailPanel
              location={selectedLocation}
              onClose={() => setSelectedLocation(null)}
            />
          )}
        </div>
      </div>
    </>
  );
}