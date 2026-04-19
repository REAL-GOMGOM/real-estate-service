'use client';

import { Suspense, useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/layout/Header';
import KakaoMap from '@/components/location-map/KakaoMap';
import LocationSidebar from '@/components/location-map/LocationSidebar';
import LocationDetailPanel from '@/components/location-map/LocationDetailPanel';
import LayerToggle from '@/components/location-map/LayerToggle';
import SchoolDetailPanel, { type SchoolData } from '@/components/location-map/SchoolDetailPanel';
import BottomSheet from '@/components/common/BottomSheet';
import FloatingNavPanel from '@/components/location-map/FloatingNavPanel';
import type { LocationScore } from '@/lib/types';

const ALL_LOCATIONS: LocationScore[] = require('@/data/location-scores.json');

const VALID_REGIONS = [
  '전체', '서울', '경기', '인천', '1기신도시', '2기신도시', '3기신도시',
  '부산', '대구', '울산',
];

function isValidRegion(value: string | null): value is string {
  return value !== null && VALID_REGIONS.includes(value);
}

function LocationMapContent() {
  const searchParams = useSearchParams();

  const regionParam = searchParams.get('region');
  const highlightParam = searchParams.get('highlight');

  const initialRegion = isValidRegion(regionParam) ? regionParam : '전체';

  const [selectedRegion, setSelectedRegion] = useState<string>(initialRegion);
  const [selectedLocation, setSelectedLocation] = useState<LocationScore | null>(
    () => {
      if (highlightParam) {
        return ALL_LOCATIONS.find((l) => l.id === highlightParam) ?? null;
      }
      return null;
    },
  );
  const [showToheoOnly, setShowToheoOnly] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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

  const fetchSchools = useCallback(async () => {
    if (activeLayers.size === 0) {
      setSchools([]);
      return;
    }
    try {
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
    setSelectedLocation(null);
  };

  const handleLocationClick = (loc: LocationScore) => {
    setSelectedLocation(loc);
    setSelectedSchool(null);
  };

  const nearbySchools = useMemo(() => {
    if (!selectedSchool) return [];
    return schools.filter((s) => s.district === selectedSchool.district && s.id !== selectedSchool.id);
  }, [selectedSchool, schools]);

  const mapArea = (
    <div style={{ position: 'relative', flex: 1, height: isMobile ? '60vh' : 'calc(100vh - 64px)' }}>
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
      {!isMobile && !selectedLocation && !selectedSchool && <FloatingNavPanel />}
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

  return (
    <>
      <Header />
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', paddingTop: '64px' }}>
        {isMobile ? <>{mapArea}{sidebar}</> : <>{sidebar}{mapArea}</>}
      </div>
    </>
  );
}

function LocationMapFallback() {
  return (
    <>
      <Header />
      <div
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          paddingTop: '64px',
        }}
      >
        지도 로딩 중…
      </div>
    </>
  );
}

export default function LocationMapPage() {
  return (
    <Suspense fallback={<LocationMapFallback />}>
      <LocationMapContent />
    </Suspense>
  );
}
