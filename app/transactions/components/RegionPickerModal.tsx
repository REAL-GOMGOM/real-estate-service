'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * 시도 카드 클릭 시 뜨는 구 선택 모달 — 사이클 W (아실형)
 *
 * "{시도} 전체 보기" (첫 구로 진입) + 구별 버튼 그리드.
 * 배경 클릭·X·ESC 로 닫기, 열림 중 배경 스크롤 잠금.
 */

interface RegionPickerModalProps {
  label:     string;          // 시도명 (예: 부산)
  districts: string[];        // 구 목록
  onPick:    (district: string) => void;
  onClose:   () => void;
}

/** '부산 해운대구' → '해운대구', '성남시 분당구' 는 그대로 표기 */
function shortName(district: string): string {
  return district.replace(/^(부산|인천|대구|울산|대전|광주) /, '');
}

export default function RegionPickerModal({ label, districts, onPick, onClose }: RegionPickerModalProps) {
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
      aria-label={`${label} 지역 선택`}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        backgroundColor: 'rgba(10,16,32,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto',
          backgroundColor: 'var(--bg-primary)', borderRadius: '20px',
          border: '1px solid var(--border)', padding: '20px',
          boxShadow: '0 24px 80px rgba(10,16,32,0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 전체 보기 — 첫 구로 진입 */}
        <button
          onClick={() => onPick(districts[0])}
          style={{
            width: '100%', padding: '14px', borderRadius: '12px',
            backgroundColor: 'var(--ink, #14213D)', color: '#FFFFFF',
            fontSize: '15px', fontWeight: 700, border: 'none', cursor: 'pointer',
            marginBottom: '16px',
          }}
        >
          {label} 전체 보기
        </button>

        {/* 구 버튼 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {districts.map((d) => (
            <button
              key={d}
              onClick={() => onPick(d)}
              style={{
                padding: '13px 8px', borderRadius: '10px', fontSize: '14px', fontWeight: 600,
                backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
                border: '1px solid var(--border)', cursor: 'pointer',
                transition: 'border-color 0.15s',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              {shortName(d)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
