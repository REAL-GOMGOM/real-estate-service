'use client';

import Link from 'next/link';
import { KOREA_REGIONS } from '@/lib/korea-map-paths';

/**
 * 메인 좌측 필터 레일 — 사이클 W.
 * 지도 미리보기를 실제 17개 시도 실루엣(korea-map-paths)으로 교체,
 * 지역 칩은 피드 지역 상태(FeedSection)와 연동.
 */

const REGION_CHIPS = ['강남구', '서초구', '송파구', '마포구', '용산구'];

// 미리보기에서 강조할 수도권 시도 코드 (서울 11 · 인천 28 · 경기 41)
const HIGHLIGHT_CODES = new Set(['11', '28', '41']);

interface FilterRailProps {
  active: string;
  onPick: (district: string) => void;
}

function MiniKoreaMap() {
  return (
    <svg
      viewBox="60 240 700 760"
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden
    >
      {KOREA_REGIONS.map((r) => {
        const highlighted = HIGHLIGHT_CODES.has(r.code);
        return (
          <path
            key={r.code}
            d={r.path}
            fill={highlighted ? 'var(--accent)' : '#C9D6EE'}
            opacity={highlighted ? 0.88 : 0.75}
            stroke="#FFFFFF"
            strokeWidth="6"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

export function FilterRail({ active, onPick }: FilterRailProps) {
  return (
    <aside className="hidden lg:flex flex-col gap-4">
      {/* 지도 미리보기 — 실제 시도 실루엣 */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <Link
          href="/price-map"
          style={{
            display: 'block', position: 'relative', height: '150px',
            backgroundColor: '#EFF3FB', borderBottom: '1px solid var(--border)',
            padding: '8px',
          }}
        >
          <MiniKoreaMap />
          <span
            style={{
              position: 'absolute', bottom: '8px', left: '8px',
              backgroundColor: 'rgba(255,255,255,0.92)',
              fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
              padding: '4px 9px', borderRadius: '6px',
            }}
          >
            시세 지도로 보기 →
          </span>
        </Link>
        <div style={{ padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '10px', letterSpacing: '0.2px' }}>
            지역 필터
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REGION_CHIPS.map((r) => {
              const isActive = r === active;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => onPick(r)}
                  aria-pressed={isActive}
                  style={{
                    backgroundColor: isActive ? 'var(--accent)' : 'var(--btn-bg)',
                    color: isActive ? '#FFFFFF' : 'var(--text-muted)',
                    fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: '8px',
                    border: 'none', cursor: 'pointer',
                  }}
                >
                  {r}
                </button>
              );
            })}
            <Link
              href="/transactions"
              style={{
                backgroundColor: 'var(--btn-bg)', color: 'var(--text-muted)',
                fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: '8px',
              }}
            >
              + 전체
            </Link>
          </div>
        </div>
      </div>

      {/* 거래 유형 · 가격대 (프레젠테이션 — 실필터는 후속) */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '14px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '11px' }}>거래 유형</div>
        <div className="flex flex-col gap-2" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center"
              style={{ width: '16px', height: '16px', borderRadius: '5px', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '10px' }}
            >
              ✓
            </span>
            매매
          </span>
          <span className="flex items-center gap-2">
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '1.5px solid #CDD5E4' }} />
            전세 <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>준비 중</span>
          </span>
          <span className="flex items-center gap-2">
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '1.5px solid #CDD5E4' }} />
            월세 <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>준비 중</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
