'use client';

import { Search } from 'lucide-react';

interface Props {
  selectedStatus: string;
  selectedDistrict: string;
  searchQuery: string;
  onStatusChange: (status: string) => void;
  onDistrictChange: (district: string) => void;
  onSearchChange: (query: string) => void;
  districts: string[];
}

const STATUS_OPTIONS = [
  { value: '전체', label: '전체' },
  { value: 'ongoing', label: '청약 중' },
  { value: 'upcoming', label: '청약 예정' },
  { value: 'closed', label: '청약 마감' },
];

export default function SubscriptionFilter({
  selectedStatus,
  selectedDistrict,
  searchQuery,
  onStatusChange,
  onDistrictChange,
  onSearchChange,
  districts,
}: Props) {
  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: '12px',
      padding: '20px 24px',
      backgroundColor: 'var(--bg-card)',
      borderRadius: '16px',
      border: '1px solid var(--border)',
      marginBottom: '24px',
    }}>

      {/* 상태 필터 */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onStatusChange(opt.value)}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              backgroundColor: selectedStatus === opt.value ? 'var(--accent)' : 'var(--border-light)',
              color: selectedStatus === opt.value ? 'white' : 'var(--text-muted)',
              transition: 'background 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 구분선 */}
      <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }} />

      {/* 지역 필터 */}
      <select
        value={selectedDistrict}
        onChange={(e) => onDistrictChange(e.target.value)}
        style={{
          padding: '8px 14px',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 500,
          backgroundColor: 'var(--border-light)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        <option value="전체">전체 지역</option>
        {districts.map((d) => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>

      {/* 검색 */}
      <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-dim)',
          }}
        />
        <input
          type="text"
          placeholder="단지명 검색..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px 8px 32px',
            borderRadius: '10px',
            fontSize: '13px',
            backgroundColor: 'var(--border-light)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}