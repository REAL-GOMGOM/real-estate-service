'use client';

import Link from 'next/link';
import { X, TrendingUp, TrendingDown, Minus, MapPin, AlertTriangle, BarChart2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { LocationScore } from '@/lib/types';
import { getScoreColor, getScoreBgColor } from './LocationSidebar';

interface Props {
  location: LocationScore;
  onClose: () => void;
  embedded?: boolean;
}

export default function LocationDetailPanel({ location, onClose, embedded }: Props) {
  const scoreDiff = (location.score - location.prevScore).toFixed(1);
  const isUp   = location.trend === 'up';
  const isDown = location.trend === 'down';
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const panelStyle: React.CSSProperties = embedded ? {} : isMobile ? {
    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
    borderRadius: '20px 20px 0 0',
    maxHeight: '70vh', overflowY: 'auto',
  } : {
    position: 'absolute', bottom: '32px', right: '32px', zIndex: 100,
    width: '280px', borderRadius: '20px',
  };

  return (
    <div style={{
      ...panelStyle,
      backgroundColor: 'var(--bg-card)',
      border: location.isToheo ? '1px solid rgba(249,115,22,0.4)' : '1px solid var(--border-hover)',
      backdropFilter: 'blur(16px)',
      boxShadow: location.isToheo ? '0 24px 64px rgba(249,115,22,0.15)' : '0 24px 64px rgba(0,0,0,0.5)',
      padding: '18px',
    }}>

      {/* 닫기 */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'var(--border)', border: 'none',
          borderRadius: '8px', width: '28px', height: '28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'var(--text-muted)',
        }}
      >
        <X size={14} />
      </button>

      {/* 차트 보기 버튼 */}
      <Link
        href={`/chart?district=${encodeURIComponent(location.district)}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          padding: '10px', borderRadius: '12px', marginBottom: '14px',
          backgroundColor: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)',
          color: 'var(--accent)', textDecoration: 'none',
          fontSize: '13px', fontWeight: 600,
        }}
      >
        <BarChart2 size={15} />
        이 지역 아파트 차트 보기
      </Link>

      {/* 토허제 경고 배너 */}
      {location.isToheo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '10px',
          backgroundColor: 'rgba(249,115,22,0.12)',
          border: '1px solid rgba(249,115,22,0.25)',
          marginBottom: '16px',
        }}>
          <AlertTriangle size={14} style={{ color: '#F97316', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: '11px', fontWeight: 700, color: '#F97316' }}>토지거래허가구역</p>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>적용기간 ~{location.toheoUntil}</p>
          </div>
        </div>
      )}

      {/* 지역명 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: getScoreBgColor(location.score),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MapPin size={18} style={{ color: getScoreColor(location.score) }} />
        </div>
        <div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{location.name}</p>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{location.district}</p>
        </div>
      </div>

      {/* 점수 */}
      <div style={{
        padding: '16px', borderRadius: '14px',
        backgroundColor: getScoreBgColor(location.score),
        marginBottom: '16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>입지 점수</p>
          <p style={{
            fontSize: '28px', fontWeight: 800,
            fontFamily: 'Roboto Mono, monospace',
            color: getScoreColor(location.score),
          }}>
            {location.score.toFixed(1)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>전월 대비</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            {isUp   && <TrendingUp   size={16} style={{ color: '#22C55E' }} />}
            {isDown && <TrendingDown size={16} style={{ color: '#EF4444' }} />}
            {!isUp && !isDown && <Minus size={16} style={{ color: 'var(--text-dim)' }} />}
            <span style={{
              fontSize: '16px', fontWeight: 700,
              fontFamily: 'Roboto Mono, monospace',
              color: isUp ? '#22C55E' : isDown ? '#EF4444' : 'var(--text-dim)',
            }}>
              {isUp ? '+' : ''}{scoreDiff}
            </span>
          </div>
        </div>
      </div>

      {/* 상세 정보 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {[
          { label: '기준 월',   value: location.month },
          { label: '전월 점수', value: location.prevScore.toFixed(1), mono: true },
          {
            label: '트렌드',
            value: location.trend === 'up' ? '상승 ▲' : location.trend === 'down' ? '하락 ▼' : '보합 —',
            color: location.trend === 'up' ? '#22C55E' : location.trend === 'down' ? '#EF4444' : 'var(--text-dim)',
          },
          ...(location.region ? [{ label: '권역', value: location.region }] : []),
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>{item.label}</span>
            <span style={{
              fontSize: '13px', fontWeight: 600,
              color: item.color ?? 'var(--text-primary)',
              fontFamily: item.mono ? 'Roboto Mono, monospace' : 'inherit',
            }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}