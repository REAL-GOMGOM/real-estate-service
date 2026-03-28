'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MonthNavigatorProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export default function MonthNavigator({ year, month, onPrev, onNext, onToday }: MonthNavigatorProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      <button
        onClick={onPrev}
        style={{
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: 'var(--border-light)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronLeft size={18} />
      </button>

      <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', minWidth: '140px', textAlign: 'center' }}>
        {year}년 {month}월
      </h2>

      <button
        onClick={onNext}
        style={{
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: 'var(--border-light)', border: '1px solid var(--border)',
          color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <ChevronRight size={18} />
      </button>

      <button
        onClick={onToday}
        style={{
          padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
          backgroundColor: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)',
          color: '#3B82F6', cursor: 'pointer',
        }}
      >
        오늘
      </button>
    </div>
  );
}
