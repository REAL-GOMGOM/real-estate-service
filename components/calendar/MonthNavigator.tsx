'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthNavigatorProps {
  year:    number;
  month:   number;
  onPrev:  () => void;
  onNext:  () => void;
}

const MONTH_NAMES = ['1월', '2월', '3월', '4월', '5월', '6월',
                     '7월', '8월', '9월', '10월', '11월', '12월'];

export default function MonthNavigator({ year, month, onPrev, onNext }: MonthNavigatorProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: '20px',
    }}>
      <button
        onClick={onPrev}
        aria-label="이전 달"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer', color: '#94A3B8',
        }}
      >
        <ChevronLeft size={18} />
      </button>

      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#F1F5F9', lineHeight: 1 }}>
          {year}년 {MONTH_NAMES[month - 1]}
        </h2>
        <p style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>부동산 달력</p>
      </div>

      <button
        onClick={onNext}
        aria-label="다음 달"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer', color: '#94A3B8',
        }}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
