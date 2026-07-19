'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { DISTRICT_GROUPS } from '@/lib/district-groups';

/**
 * 지역 선택 모달 — 전국화 (2026-07-19).
 *
 * 기존: 진입한 시/도의 구 목록만 표시 (부산 보다가 서울로 못 감).
 * 개편: 상단 시/도 칩으로 전국 어느 권역이든 전환 후 구 선택.
 * 현재 보고 있는 구는 하이라이트. 배경 클릭·X·ESC 닫기, 스크롤 잠금 유지.
 */

interface RegionPickerModalProps {
  /** 처음 펼칠 시/도 (현재 권역) */
  initialLabel:    string;
  /** 현재 보고 있는 구 — 하이라이트 표시 */
  activeDistrict?: string;
  onPick:          (district: string) => void;
  onClose:         () => void;
}

/** '부산 해운대구' → '해운대구', '성남시 분당구' 는 그대로 표기 */
function shortName(district: string): string {
  return district.replace(/^(부산|인천|대구|울산|대전|광주) /, '');
}

export default function RegionPickerModal({ initialLabel, activeDistrict, onPick, onClose }: RegionPickerModalProps) {
  const initialIdx = Math.max(0, DISTRICT_GROUPS.findIndex((g) => g.label === initialLabel));
  const [selIdx, setSelIdx] = useState(initialIdx);
  const group = DISTRICT_GROUPS[selIdx];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="지역 선택"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(10,16,32,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="rounded-scroll"
        style={{
          width: '100%', maxWidth: '560px', maxHeight: '84vh', overflowY: 'auto',
          backgroundColor: 'var(--bg-primary)', borderRadius: '20px',
          border: '1px solid var(--border)', padding: '20px',
          boxShadow: '0 24px 80px rgba(10,16,32,0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>지역 선택</span>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 시/도 칩 — 전국 어느 권역이든 전환 */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {DISTRICT_GROUPS.map((g, i) => (
            <button
              key={g.label}
              onClick={() => setSelIdx(i)}
              style={{
                padding: '7px 13px', borderRadius: '18px', fontSize: '12.5px', fontWeight: 700,
                backgroundColor: i === selIdx ? 'var(--accent)' : 'var(--border-light)',
                color:           i === selIdx ? '#FFFFFF'       : 'var(--text-muted)',
                border: 'none', cursor: 'pointer',
              }}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* 전체 보기 — 첫 구로 진입 */}
        <button
          onClick={() => onPick(group.districts[0])}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            backgroundColor: 'var(--ink, #14213D)', color: '#FFFFFF',
            fontSize: '15px', fontWeight: 700, border: 'none', cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          {group.label} 전체 보기
        </button>

        {/* 구 버튼 그리드 — 현재 보고 있는 구 하이라이트 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {group.districts.map((d) => {
            const isActive = d === activeDistrict;
            return (
              <button
                key={d}
                onClick={() => onPick(d)}
                style={{
                  padding: '13px 8px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                  backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-card)',
                  color:           isActive ? '#FFFFFF'       : 'var(--text-primary)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer', transition: 'border-color 0.15s',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                {shortName(d)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
