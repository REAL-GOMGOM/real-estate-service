'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Building2, AlertTriangle, Search } from 'lucide-react';

interface ApartmentSummary {
  id: string;
  name: string;
  district: string;
  address: string;
  areas: number[];
  latestPrice: number;
  priceChange: number;
}

interface Props {
  apartments: ApartmentSummary[];
  selectedId: string;
  selectedArea: number | 'all';
  activeDistrict: string;
  onSelect: (id: string) => void;
  onAreaChange: (area: number | 'all') => void;
  onDistrictChange: (district: string) => void;
  onAptSearch: (aptName: string) => void;
  isMobile?: boolean;
}

const REGIONS: { label: string; districts: string[] }[] = [
  {
    label: '서울',
    districts: [
      '강남구', '서초구', '송파구', '용산구', '마포구', '성동구',
      '영등포구', '양천구', '강동구', '광진구', '동작구', '관악구',
      '강서구', '구로구', '노원구', '도봉구', '동대문구', '서대문구',
      '성북구', '은평구', '종로구', '중구', '중랑구', '강북구', '금천구',
    ],
  },
  {
    label: '경기',
    districts: [
      '성남시 분당구', '과천시', '하남시', '수원시 영통구', '수원시 팔달구',
      '용인시 수지구', '용인시 기흥구', '용인시 처인구',
      '고양시 일산동구', '고양시 일산서구', '고양시 덕양구',
      '안양시 동안구', '안양시 만안구', '광명시', '의왕시', '부천시',
      '구리시', '남양주시', '의정부시', '시흥시', '김포시', '화성시',
      '평택시', '파주시', '군포시', '양주시', '광주시', '이천시',
    ],
  },
  {
    label: '인천',
    districts: [
      '인천 연수구', '인천 서구', '인천 부평구', '인천 남동구',
      '인천 계양구', '인천 미추홀구', '인천 동구', '인천 중구',
    ],
  },
  {
    label: '부산',
    districts: [
      '부산 해운대구', '부산 수영구', '부산 동래구', '부산 연제구',
      '부산 남구', '부산 부산진구', '부산 동구', '부산 중구',
      '부산 서구', '부산 영도구', '부산 강서구', '부산 사상구',
      '부산 북구', '부산 금정구', '부산 사하구',
    ],
  },
  {
    label: '대구/울산',
    districts: [
      '대구 수성구', '대구 달서구', '대구 북구', '대구 동구',
      '대구 중구', '대구 서구', '대구 남구', '대구 달성군',
      '울산 남구', '울산 동구', '울산 북구', '울산 중구', '울산 울주군',
    ],
  },
];

// 토허제 지정 구역
const TOHEO_DISTRICTS = new Set([
  '강남구', '서초구', '송파구', '용산구', '마포구', '성동구',
  '영등포구', '양천구', '광진구', '강동구', '동작구', '관악구',
  '강서구', '구로구', '노원구', '도봉구', '동대문구', '서대문구',
  '성북구', '은평구', '종로구', '중구', '중랑구', '강북구', '금천구',
]);

export default function ApartmentSelector({
  apartments,
  selectedId,
  selectedArea,
  activeDistrict,
  onSelect,
  onAreaChange,
  onDistrictChange,
  onAptSearch,
  isMobile = false,
}: Props) {
  const selectedApt = apartments.find((a) => a.id === selectedId);
  const isToheo     = TOHEO_DISTRICTS.has(activeDistrict);

  const activeRegionIndex = REGIONS.findIndex((r) => r.districts.includes(activeDistrict));
  // -1 = 전체
  const [regionIdx, setRegionIdx] = useState<number>(-1);
  const [districtSearch, setDistrictSearch] = useState('');
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const ALL_DISTRICTS = REGIONS.flatMap((r) => r.districts);
  const visibleDistricts = districtSearch.trim()
    ? ALL_DISTRICTS.filter((d) => d.includes(districtSearch.trim()))
    : regionIdx === -1
      ? ALL_DISTRICTS
      : REGIONS[regionIdx].districts;

  return (
    <aside style={{
      width: isMobile ? '100%' : '280px', flexShrink: 0,
      height: isMobile ? 'auto' : 'calc(100vh - 64px)',
      overflowY: isMobile ? 'visible' : 'auto',
      backgroundColor: 'var(--bg-card)',
      borderRight: isMobile ? 'none' : '1px solid var(--border)',
      borderBottom: isMobile ? '1px solid var(--border)' : 'none',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* 헤더 - 모바일에서는 접기/펼치기 토글 */}
      <div
        style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-light)', cursor: isMobile ? 'pointer' : 'default' }}
        onClick={() => isMobile && setMobileOpen(!mobileOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {isMobile ? `📍 ${activeDistrict}` : '아파트 차트'}
            </h2>
            {isToheo && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: '3px',
                padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
                backgroundColor: 'rgba(249,115,22,0.15)', color: '#F97316',
                border: '1px solid rgba(249,115,22,0.3)',
              }}>
                <AlertTriangle size={9} />토허제
              </span>
            )}
          </div>
          {isMobile && (
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              {mobileOpen ? '▲ 접기' : '▼ 필터 열기'}
            </span>
          )}
        </div>
        {!isMobile && <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>단지 선택 후 실거래가 차트 확인</p>}
      </div>

      {/* 모바일: 접혀있으면 나머지 숨김. PC: 항상 표시 */}
      <div style={{ display: (!isMobile || mobileOpen) ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>

      {/* 지역 선택 */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-light)' }}>
        {/* 구 검색 */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="구/시 검색 (예: 강남, 분당)"
            value={districtSearch}
            onChange={(e) => { setDistrictSearch(e.target.value); setRegionIdx(-1); }}
            style={{
              width: '100%', padding: '6px 10px 6px 28px', borderRadius: '8px',
              fontSize: '11px', backgroundColor: 'var(--border-light)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* 권역 탭 */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', flexWrap: 'wrap' }}>
          {[{ label: '전체', idx: -1 }, ...REGIONS.map((r, i) => ({ label: r.label, idx: i }))].map(({ label, idx }) => (
            <button
              key={label}
              onClick={() => { setRegionIdx(idx); setDistrictSearch(''); }}
              style={{
                padding: '4px 9px', borderRadius: '7px', fontSize: '11px', fontWeight: 600,
                cursor: 'pointer', border: 'none',
                backgroundColor: regionIdx === idx && !districtSearch ? 'var(--accent)' : 'var(--border-light)',
                color: regionIdx === idx && !districtSearch ? '#fff' : 'var(--text-dim)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 구 목록 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', maxHeight: '110px', overflowY: 'auto' }}>
          {visibleDistricts.map((d) => {
            const active  = activeDistrict === d;
            const toheo   = TOHEO_DISTRICTS.has(d);
            return (
              <button
                key={d}
                onClick={() => onDistrictChange(d)}
                style={{
                  padding: '4px 9px', borderRadius: '7px', fontSize: '11px', fontWeight: 500,
                  cursor: 'pointer',
                  border: active ? '1px solid var(--accent-border)' : toheo ? '1px solid rgba(249,115,22,0.25)' : '1px solid var(--border)',
                  backgroundColor: active ? 'var(--accent-bg)' : toheo ? 'rgba(249,115,22,0.07)' : 'var(--border-light)',
                  color: active ? 'var(--accent)' : toheo ? '#FB923C' : 'var(--text-muted)',
                }}
              >
                {d.replace(/^(서울|경기|인천|부산|대구|울산)\s/, '')}
              </button>
            );
          })}
        </div>

        {/* 범례 */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(249,115,22,0.4)', border: '1px solid rgba(249,115,22,0.5)' }} />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>토허제</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'var(--accent-border)', border: '1px solid var(--accent-border)' }} />
            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>선택 중</span>
          </div>
        </div>
      </div>

      {/* 평형 필터 */}
      {selectedApt && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-light)' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>평형 선택</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => onAreaChange('all')}
              style={{
                padding: '5px 10px', borderRadius: '8px',
                fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: 'none',
                backgroundColor: selectedArea === 'all' ? 'var(--accent)' : 'var(--border-light)',
                color: selectedArea === 'all' ? 'white' : 'var(--text-muted)',
              }}
            >
              전체
            </button>
            {selectedApt.areas.map((area) => (
              <button
                key={area}
                onClick={() => onAreaChange(area)}
                style={{
                  padding: '5px 10px', borderRadius: '8px',
                  fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: 'none',
                  backgroundColor: selectedArea === area ? 'var(--accent)' : 'var(--border-light)',
                  color: selectedArea === area ? 'white' : 'var(--text-muted)',
                }}
              >
                {Math.floor(area * 0.3025)}평 ({area}㎡)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 단지 목록 */}
      <div style={{ padding: '14px 20px', flex: 1, maxHeight: isMobile ? '240px' : 'none', overflowY: isMobile ? 'auto' : 'visible' }}>
        {/* 단지 검색 */}
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="단지명 검색 (전국)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value.length >= 2) onAptSearch(e.target.value);
            }}
            style={{
              width: '100%', padding: '7px 10px 7px 28px', borderRadius: '8px',
              fontSize: '12px', backgroundColor: 'var(--border-light)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '10px' }}>
          주요 단지 ({apartments.filter(a => !search || a.name.includes(search)).length}개)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {apartments.filter(a => !search || a.name.includes(search)).map((apt) => (
            <button
              key={apt.id}
              onClick={() => onSelect(apt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 12px', borderRadius: '12px', width: '100%',
                backgroundColor: selectedId === apt.id ? 'var(--accent-bg)' : 'var(--border-light)',
                border: selectedId === apt.id ? '1px solid var(--accent-border)' : '1px solid var(--border-light)',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: selectedId === apt.id ? 'var(--accent-border)' : 'var(--border-light)',
              }}>
                <Building2 size={16} style={{ color: selectedId === apt.id ? 'var(--accent)' : 'var(--text-dim)' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: '2px',
                }}>
                  {apt.name}
                </p>
                <p style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{apt.district}</p>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  {(apt.latestPrice / 10000).toFixed(0)}억
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                  {apt.priceChange >= 0
                    ? <TrendingUp size={10} style={{ color: '#22C55E' }} />
                    : <TrendingDown size={10} style={{ color: '#EF4444' }} />
                  }
                  <span style={{ fontSize: '10px', fontWeight: 600, color: apt.priceChange >= 0 ? '#22C55E' : '#EF4444' }}>
                    {apt.priceChange >= 0 ? '+' : ''}{apt.priceChange.toFixed(1)}%
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      </div>{/* 모바일 접기/펼치기 래퍼 닫기 */}
    </aside>
  );
}
