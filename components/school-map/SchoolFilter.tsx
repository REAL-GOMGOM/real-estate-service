'use client';

import type { SchoolType } from '@/types/school-map';
import { SCHOOL_TYPE_MAP } from '@/types/school-map';

const DISTRICTS = ['전체', '강남구', '서초구', '송파구', '양천구', '노원구'];

interface SchoolFilterProps {
  activeTypes: Set<SchoolType>;
  onTypeToggle: (type: SchoolType) => void;
  selectedDistrict: string;
  onDistrictChange: (district: string) => void;
}

export default function SchoolFilter({
  activeTypes, onTypeToggle, selectedDistrict, onDistrictChange,
}: SchoolFilterProps) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
      {/* 학교 유형 */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {(Object.entries(SCHOOL_TYPE_MAP) as [SchoolType, typeof SCHOOL_TYPE_MAP[SchoolType]][]).map(
          ([key, info]) => {
            const active = activeTypes.has(key);
            return (
              <button
                key={key}
                onClick={() => onTypeToggle(key)}
                style={{
                  padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                  backgroundColor: active ? info.color + '22' : 'var(--border-light)',
                  color: active ? info.color : 'var(--text-dim)',
                  outline: active ? `1.5px solid ${info.color}55` : '1.5px solid transparent',
                }}
              >
                {info.icon} {info.label}
              </button>
            );
          },
        )}
      </div>

      {/* 지역 선택 */}
      <select
        value={selectedDistrict}
        onChange={(e) => onDistrictChange(e.target.value)}
        style={{
          padding: '8px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
          backgroundColor: 'var(--border-light)', color: 'var(--text-secondary)',
          border: '1px solid var(--border)', cursor: 'pointer',
          outline: 'none',
        }}
      >
        {DISTRICTS.map((d) => (
          <option key={d} value={d} style={{ backgroundColor: 'var(--bg-tertiary)' }}>{d}</option>
        ))}
      </select>
    </div>
  );
}
