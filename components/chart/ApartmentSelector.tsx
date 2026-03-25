'use client';

import { TrendingUp, TrendingDown, Building2 } from 'lucide-react';

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
  onSelect: (id: string) => void;
  onAreaChange: (area: number | 'all') => void;
}

export default function ApartmentSelector({
  apartments,
  selectedId,
  selectedArea,
  onSelect,
  onAreaChange,
}: Props) {
  const selectedApt = apartments.find((a) => a.id === selectedId);

  return (
    <aside style={{
      width: '280px', flexShrink: 0,
      height: 'calc(100vh - 64px)', overflowY: 'auto',
      backgroundColor: '#0F1629',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column',
    }}>

      {/* 헤더 */}
      <div style={{ padding: '20px 20px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#F1F5F9', marginBottom: '3px' }}>
          아파트 차트
        </h2>
        <p style={{ fontSize: '11px', color: '#475569' }}>단지 선택 후 실거래가 차트 확인</p>
      </div>

      {/* 평형 필터 */}
      {selectedApt && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '8px' }}>평형 선택</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              onClick={() => onAreaChange('all')}
              style={{
                padding: '5px 10px', borderRadius: '8px',
                fontSize: '11px', fontWeight: 500, cursor: 'pointer', border: 'none',
                backgroundColor: selectedArea === 'all' ? '#3B82F6' : 'rgba(255,255,255,0.06)',
                color: selectedArea === 'all' ? 'white' : '#94A3B8',
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
                  backgroundColor: selectedArea === area ? '#3B82F6' : 'rgba(255,255,255,0.06)',
                  color: selectedArea === area ? 'white' : '#94A3B8',
                }}
              >
                {Math.floor(area * 0.3025)}평 ({area}㎡)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 단지 목록 */}
      <div style={{ padding: '14px 20px', flex: 1 }}>
        <p style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '10px' }}>
          주요 단지 ({apartments.length}개)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {apartments.map((apt) => (
            <button
              key={apt.id}
              onClick={() => onSelect(apt.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 12px', borderRadius: '12px', width: '100%',
                backgroundColor: selectedId === apt.id ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                border: selectedId === apt.id ? '1px solid rgba(59,130,246,0.4)' : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              {/* 아이콘 */}
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: selectedId === apt.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.06)',
              }}>
                <Building2 size={16} style={{ color: selectedId === apt.id ? '#3B82F6' : '#64748B' }} />
              </div>

              {/* 정보 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: '13px', fontWeight: 600, color: '#F1F5F9',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: '2px',
                }}>
                  {apt.name}
                </p>
                <p style={{ fontSize: '11px', color: '#475569' }}>{apt.district}</p>
              </div>

              {/* 최근 가격 */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: '#F1F5F9', marginBottom: '2px' }}>
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
    </aside>
  );
}