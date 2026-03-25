'use client';

import { useState } from 'react';
import { Search, Plus } from 'lucide-react';
import { DISTRICT_CODE } from '@/lib/district-codes';

interface Props {
  onAdd: (district: string, aptName: string) => void;
  loading: boolean;
}

const SEOUL_DISTRICTS = Object.keys(DISTRICT_CODE).filter((k) =>
  !k.includes('시 ') && !k.includes('인천') && !k.includes('부산') &&
  !k.includes('대구') && !k.includes('울산')
);

export default function ApartmentSearch({ onAdd, loading }: Props) {
  const [district, setDistrict] = useState('강남구');
  const [aptName,  setAptName]  = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = aptName.trim();
    if (!trimmed) return;
    onAdd(district, trimmed);
    setAptName('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
        padding: '16px 20px',
        borderRadius: '14px',
        backgroundColor: '#0F1629',
        border: '1px solid rgba(255,255,255,0.08)',
        marginBottom: '24px',
      }}
    >
      <span style={{ fontSize: '13px', color: '#64748B', flexShrink: 0 }}>단지 추가</span>

      {/* 구 선택 */}
      <select
        value={district}
        onChange={(e) => setDistrict(e.target.value)}
        style={{
          padding: '8px 12px', borderRadius: '10px', fontSize: '13px',
          backgroundColor: 'rgba(255,255,255,0.06)', color: '#F1F5F9',
          border: '1px solid rgba(255,255,255,0.1)', outline: 'none', cursor: 'pointer',
        }}
      >
        {SEOUL_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>

      {/* 단지명 입력 */}
      <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
        <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
        <input
          type="text"
          placeholder="단지명 입력 (예: 은마아파트)"
          value={aptName}
          onChange={(e) => setAptName(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px 8px 30px', borderRadius: '10px', fontSize: '13px',
            backgroundColor: 'rgba(255,255,255,0.06)', color: '#F1F5F9',
            border: '1px solid rgba(255,255,255,0.1)', outline: 'none',
          }}
        />
      </div>

      <button
        type="submit"
        disabled={loading || !aptName.trim()}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
          backgroundColor: aptName.trim() ? '#3B82F6' : 'rgba(255,255,255,0.06)',
          color: aptName.trim() ? 'white' : '#475569',
          border: 'none', cursor: aptName.trim() ? 'pointer' : 'default',
          transition: 'background 0.15s',
        }}
      >
        <Plus size={14} />
        추가
      </button>
    </form>
  );
}
