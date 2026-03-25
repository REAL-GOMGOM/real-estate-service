'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LocationScore } from '@/lib/types';

export function getScoreColor(score: number): string {
  if (score >= 4.0) return '#22C55E';
  if (score >= 3.0) return '#86EFAC';
  if (score >= 2.0) return '#F59E0B';
  return '#EF4444';
}

export function getScoreBgColor(score: number): string {
  if (score >= 4.0) return 'rgba(34,197,94,0.15)';
  if (score >= 3.0) return 'rgba(134,239,172,0.1)';
  if (score >= 2.0) return 'rgba(245,158,11,0.15)';
  return 'rgba(239,68,68,0.15)';
}

// 권역 탭 — 2줄 구성
const REGION_TABS_ROW1 = ['전체', '서울', '경기', '인천'];
const REGION_TABS_ROW2 = ['1기신도시', '2기신도시', '3기신도시'];
const REGION_TABS_ROW3 = ['부산', '대구', '울산'];

interface Props {
  allLocations: LocationScore[];
  filteredLocations: LocationScore[];
  selectedRegion: string;
  showToheoOnly: boolean;
  onRegionChange: (region: string) => void;
  onToheoToggle: (val: boolean) => void;
  onLocationClick: (location: LocationScore) => void;
}

function TrendIcon({ trend }: { trend: LocationScore['trend'] }) {
  if (trend === 'up')   return <TrendingUp   size={12} style={{ color: '#22C55E' }} />;
  if (trend === 'down') return <TrendingDown size={12} style={{ color: '#EF4444' }} />;
  return <Minus size={12} style={{ color: '#64748B' }} />;
}

function RegionTabRow({
  tabs,
  selectedRegion,
  onRegionChange,
}: {
  tabs: string[];
  selectedRegion: string;
  onRegionChange: (r: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
      {tabs.map((r) => (
        <button
          key={r}
          onClick={() => onRegionChange(r)}
          style={{
            padding: '5px 10px', borderRadius: '8px',
            fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: 'none',
            backgroundColor: selectedRegion === r ? '#3B82F6' : 'rgba(255,255,255,0.06)',
            color: selectedRegion === r ? 'white' : '#94A3B8',
            transition: 'background 0.15s', whiteSpace: 'nowrap',
          }}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export default function LocationSidebar({
  allLocations,
  filteredLocations,
  selectedRegion,
  showToheoOnly,
  onRegionChange,
  onToheoToggle,
  onLocationClick,
}: Props) {
  const top10 = [...filteredLocations].sort((a, b) => a.score - b.score).slice(0, 10);
  const toheoCount = allLocations.filter((l) => l.isToheo).length;

  return (
    <aside style={{
      width: '300px', flexShrink: 0,
      height: 'calc(100vh - 64px)', overflowY: 'auto',
      backgroundColor: '#0F1629',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* 헤더 */}
      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#F1F5F9', marginBottom: '3px' }}>
          전국 입지 점수 지도
        </h2>
        <p style={{ fontSize: '11px', color: '#475569' }}>2026년 3월 기준 · 점수 낮을수록 입지 우수</p>
      </div>

      {/* 권역 탭 */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <RegionTabRow tabs={REGION_TABS_ROW1} selectedRegion={selectedRegion} onRegionChange={onRegionChange} />
        <RegionTabRow tabs={REGION_TABS_ROW2} selectedRegion={selectedRegion} onRegionChange={onRegionChange} />
        <RegionTabRow tabs={REGION_TABS_ROW3} selectedRegion={selectedRegion} onRegionChange={onRegionChange} />
      </div>

      {/* 토허제 토글 */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => onToheoToggle(!showToheoOnly)}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: '10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: `1px solid ${showToheoOnly ? '#EF4444' : 'rgba(255,255,255,0.1)'}`,
            backgroundColor: showToheoOnly ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
            transition: 'all 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#EF4444', flexShrink: 0 }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#F1F5F9' }}>토허제 지역만 보기</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ fontSize: '10px', color: '#64748B' }}>{toheoCount}개</span>
            <div style={{
              width: '32px', height: '18px', borderRadius: '999px',
              backgroundColor: showToheoOnly ? '#EF4444' : 'rgba(255,255,255,0.1)',
              position: 'relative', transition: 'background 0.2s', flexShrink: 0,
            }}>
              <div style={{
                position: 'absolute', top: '2px',
                left: showToheoOnly ? '16px' : '2px',
                width: '14px', height: '14px', borderRadius: '50%',
                backgroundColor: 'white', transition: 'left 0.2s',
              }} />
            </div>
          </div>
        </button>
      </div>

      {/* 점수 범례 */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '8px' }}>점수 범례</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {[
            { color: '#EF4444', label: '1.0 ~ 1.9', desc: '최우수' },
            { color: '#F59E0B', label: '2.0 ~ 2.9', desc: '우수' },
            { color: '#86EFAC', label: '3.0 ~ 3.9', desc: '보통' },
            { color: '#22C55E', label: '4.0 이상',  desc: '일반' },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: item.color, flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#64748B', minWidth: '65px' }}>{item.label}</span>
              <span style={{ fontSize: '10px', color: '#475569' }}>{item.desc}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#EF4444', flexShrink: 0 }} />
            <span style={{ fontSize: '11px', color: '#64748B', minWidth: '65px' }}>빨간 점</span>
            <span style={{ fontSize: '10px', color: '#475569' }}>토지거래허가구역</span>
          </div>
        </div>
      </div>

      {/* TOP 10 */}
      <div style={{ padding: '12px 20px', flex: 1 }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '10px' }}>
          TOP 10 입지 ({filteredLocations.length}개 지역)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {top10.map((loc, index) => (
            <button
              key={loc.id}
              onClick={() => onLocationClick(loc)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 10px', borderRadius: '10px', width: '100%',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700,
                backgroundColor: index < 3 ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                color: index < 3 ? '#3B82F6' : '#64748B',
              }}>
                {index + 1}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 600, color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.name}</p>
                  {loc.isToheo && (
                    <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#EF4444', flexShrink: 0 }} />
                  )}
                </div>
                <p style={{ fontSize: '10px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loc.district}</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                <TrendIcon trend={loc.trend} />
                <span style={{
                  padding: '2px 7px', borderRadius: '6px',
                  fontSize: '12px', fontWeight: 700,
                  fontFamily: 'Roboto Mono, monospace',
                  backgroundColor: getScoreBgColor(loc.score),
                  color: getScoreColor(loc.score),
                }}>
                  {loc.score.toFixed(1)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}