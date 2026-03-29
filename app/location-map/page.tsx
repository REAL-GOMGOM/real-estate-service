'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import KakaoMap from '@/components/location-map/KakaoMap';
import LocationSidebar from '@/components/location-map/LocationSidebar';
import LocationDetailPanel from '@/components/location-map/LocationDetailPanel';
import LayerToggle from '@/components/location-map/LayerToggle';
import SchoolDetailPanel, { type SchoolData } from '@/components/location-map/SchoolDetailPanel';
import BottomSheet from '@/components/common/BottomSheet';
import type { LocationScore } from '@/lib/types';

const ALL_LOCATIONS: LocationScore[] = require('@/data/location-scores.json');

export default function LocationMapPage() {
  const [selectedRegion, setSelectedRegion] = useState<string>('전체');
  const [selectedLocation, setSelectedLocation] = useState<LocationScore | null>(null);
  const [showToheoOnly, setShowToheoOnly] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // 학교 관련 상태
  const [activeLayers, setActiveLayers] = useState<Set<string>>(() => new Set());
  const [schools, setSchools] = useState<SchoolData[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<SchoolData | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  // 학교 데이터 fetch
  const fetchSchools = useCallback(async () => {
    if (activeLayers.size === 0) {
      setSchools([]);
      return;
    }
    try {
      // 선택된 권역에 맞는 지역으로 쿼리
      const district = selectedRegion === '전체' ? '' : selectedRegion;
      const res = await fetch(`/api/map/schools${district ? `?district=${encodeURIComponent(district)}` : ''}`);
      const json = await res.json();
      setSchools(json.schools || []);
    } catch {
      // 기존 데이터 유지
    }
  }, [activeLayers.size, selectedRegion]);

  useEffect(() => {
    fetchSchools();
  }, [fetchSchools]);

  const toggleLayer = (key: string) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSchoolClick = (school: SchoolData) => {
    setSelectedSchool(school);
    setSelectedLocation(null); // 입지 패널 닫기
  };

  const handleLocationClick = (loc: LocationScore) => {
    setSelectedLocation(loc);
    setSelectedSchool(null); // 학교 패널 닫기
  };

  // 선택된 학교 주변 학교들
  const nearbySchools = useMemo(() => {
    if (!selectedSchool) return [];
    return schools.filter((s) => s.district === selectedSchool.district && s.id !== selectedSchool.id);
  }, [selectedSchool, schools]);

  const mapArea = (
    <div style={{ position: 'relative', flex: 1, height: isMobile ? '55vh' : 'calc(100vh - 64px)' }}>
      {mapReady ? (
        <KakaoMap
          locations={filteredLocations}
          onMarkerClick={handleLocationClick}
          selectedLocation={selectedLocation}
          mapConfig={mapConfig}
          schools={schools}
          activeLayers={activeLayers}
          onSchoolClick={handleSchoolClick}
        />
      ) : (
        <div style={{
          height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)', color: 'var(--text-dim)', fontSize: '14px',
        }}>
          지도를 불러오는 중...
        </div>
      )}
      {/* PC: 기존 패널 / 모바일: 바텀시트 */}
      {!isMobile && selectedLocation && (
        <LocationDetailPanel
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}
      {!isMobile && selectedSchool && (
        <SchoolDetailPanel
          school={selectedSchool}
          nearbySchools={nearbySchools}
          onClose={() => setSelectedSchool(null)}
        />
      )}
      {isMobile && (
        <BottomSheet
          isOpen={!!(selectedLocation || selectedSchool)}
          onClose={() => { setSelectedLocation(null); setSelectedSchool(null); }}
        >
          {selectedLocation && (
            <LocationDetailPanel
              location={selectedLocation}
              onClose={() => { setSelectedLocation(null); }}
              embedded
            />
          )}
          {selectedSchool && (
            <SchoolDetailPanel
              school={selectedSchool}
              nearbySchools={nearbySchools}
              onClose={() => { setSelectedSchool(null); }}
              embedded
            />
          )}
        </BottomSheet>
      )}
    </div>
  );

  const sidebar = (
    <LocationSidebar
      allLocations={ALL_LOCATIONS}
      filteredLocations={filteredLocations}
      selectedRegion={selectedRegion}
      showToheoOnly={showToheoOnly}
      onRegionChange={setSelectedRegion}
      onToheoToggle={setShowToheoOnly}
      onLocationClick={handleLocationClick}
      layerToggle={
        <LayerToggle activeLayers={activeLayers} onToggle={toggleLayer} />
      }
    />
  );

  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  return (
    <>
      <Header />
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', paddingTop: '64px' }}>
        {isMobile ? (
          <>
            {/* 모바일: 지도 전체 + 필터 토글 */}
            <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 64px)' }}>
              {mapArea}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  position: 'absolute', top: '12px', left: '12px', zIndex: 20,
                  padding: '8px 14px', borderRadius: '10px',
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-md)', fontSize: '13px', fontWeight: 600,
                  color: 'var(--text-primary)', cursor: 'pointer',
                }}
              >
                {sidebarOpen ? '✕ 닫기' : '☰ 필터'}
              </button>
            </div>
            {sidebarOpen && (
              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                maxHeight: '60vh', overflowY: 'auto',
                backgroundColor: 'var(--bg-card)', borderRadius: '20px 20px 0 0',
                border: '1px solid var(--border)', boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
              }}>
                {sidebar}
              </div>
            )}
          </>
        ) : (
          <>{sidebar}{mapArea}</>
        )}
      </div>
    </>
  );
}
