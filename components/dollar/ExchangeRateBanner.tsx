'use client';

import { AVAILABLE_YEARS } from '@/lib/exchange-rate';

interface Props {
  baseYear:          number;
  compareYear:       number;
  baseRate:          number;
  compareRate:       number;
  onBaseYearChange:    (y: number) => void;
  onCompareYearChange: (y: number) => void;
}

const SELECT_STYLE: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: 600,
  backgroundColor: 'rgba(255,255,255,0.07)',
  color: '#F1F5F9',
  border: '1px solid rgba(255,255,255,0.12)',
  cursor: 'pointer',
  outline: 'none',
};

export default function ExchangeRateBanner({
  baseYear, compareYear, baseRate, compareRate,
  onBaseYearChange, onCompareYearChange,
}: Props) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
      padding: '20px 24px',
      borderRadius: '16px',
      backgroundColor: '#0F1629',
      border: '1px solid rgba(255,255,255,0.08)',
      marginBottom: '24px',
    }}>
      {/* 기준년도 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '13px', color: '#94A3B8' }}>기준</span>
        <select value={baseYear} onChange={(e) => onBaseYearChange(Number(e.target.value))} style={SELECT_STYLE}>
          {AVAILABLE_YEARS.filter((y) => y < compareYear).map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <span style={{ fontSize: '13px', fontFamily: 'Roboto Mono, monospace', color: '#E2E8F0' }}>
          ₩{baseRate.toLocaleString()} / $1
        </span>
      </div>

      <span style={{ color: '#64748B', fontSize: '18px' }}>→</span>

      {/* 비교년도 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '13px', color: '#94A3B8' }}>비교</span>
        <select value={compareYear} onChange={(e) => onCompareYearChange(Number(e.target.value))} style={SELECT_STYLE}>
          {AVAILABLE_YEARS.filter((y) => y > baseYear).map((y) => (
            <option key={y} value={y}>{y}년</option>
          ))}
        </select>
        <span style={{ fontSize: '13px', fontFamily: 'Roboto Mono, monospace', color: '#E2E8F0' }}>
          ₩{compareRate.toLocaleString()} / $1
        </span>
      </div>

      {/* 비교 기간 요약 */}
      <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
        <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>비교 기간</p>
        <p style={{ fontSize: '13px', fontWeight: 700, color: '#F1F5F9' }}>
          {baseYear}년 → {compareYear}년&nbsp;
          <span style={{ fontWeight: 400, fontSize: '12px', color: '#94A3B8' }}>
            ({compareYear - baseYear}년간)
          </span>
        </p>
      </div>
    </div>
  );
}
