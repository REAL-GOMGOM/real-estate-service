'use client';

import Link from 'next/link';
import { X, TrendingUp, TrendingDown, Minus, MapPin, AlertTriangle, BarChart2 } from 'lucide-react';
import type { LocationScore } from '@/lib/types';
import { getScoreColor, getScoreBgColor } from './LocationSidebar';

interface Props {
  location: LocationScore;
  onClose: () => void;
}

export default function LocationDetailPanel({ location, onClose }: Props) {
  const scoreDiff = (location.score - location.prevScore).toFixed(1);
  const isUp   = location.trend === 'up';
  const isDown = location.trend === 'down';

  return (
    <div style={{
      position: 'absolute', bottom: '32px', right: '32px', zIndex: 100,
      width: '280px', borderRadius: '20px',
      backgroundColor: 'rgba(15,22,41,0.97)',
      border: location.isToheo ? '1px solid rgba(249,115,22,0.4)' : '1px solid rgba(255,255,255,0.12)',
      backdropFilter: 'blur(16px)',
      boxShadow: location.isToheo ? '0 24px 64px rgba(249,115,22,0.15)' : '0 24px 64px rgba(0,0,0,0.5)',
      padding: '24px',
    }}>

      {/* 닫기 */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: '16px', right: '16px',
          background: 'rgba(255,255,255,0.08)', border: 'none',
          borderRadius: '8px', width: '28px', height: '28px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#94A3B8',
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
          backgroundColor: 'rgba(59,130,246,0.12)',
          border: '1px solid rgba(59,130,246,0.25)',
          color: '#3B82F6', textDecoration: 'none',
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
            <p style={{ fontSize: '10px', color: '#94A3B8' }}>적용기간 ~{location.toheoUntil}</p>
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
          <p style={{ fontSize: '17px', fontWeight: 700, color: '#F1F5F9' }}>{location.name}</p>
          <p style={{ fontSize: '12px', color: '#64748B' }}>{location.district}</p>
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
          <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>입지 점수</p>
          <p style={{
            fontSize: '36px', fontWeight: 800,
            fontFamily: 'Roboto Mono, monospace',
            color: getScoreColor(location.score),
          }}>
            {location.score.toFixed(1)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '4px' }}>전월 대비</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            {isUp   && <TrendingUp   size={16} style={{ color: '#22C55E' }} />}
            {isDown && <TrendingDown size={16} style={{ color: '#EF4444' }} />}
            {!isUp && !isDown && <Minus size={16} style={{ color: '#64748B' }} />}
            <span style={{
              fontSize: '16px', fontWeight: 700,
              fontFamily: 'Roboto Mono, monospace',
              color: isUp ? '#22C55E' : isDown ? '#EF4444' : '#64748B',
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
            color: location.trend === 'up' ? '#22C55E' : location.trend === 'down' ? '#EF4444' : '#64748B',
          },
          ...(location.region ? [{ label: '권역', value: location.region }] : []),
        ].map((item) => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#64748B' }}>{item.label}</span>
            <span style={{
              fontSize: '13px', fontWeight: 600,
              color: item.color ?? '#F1F5F9',
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