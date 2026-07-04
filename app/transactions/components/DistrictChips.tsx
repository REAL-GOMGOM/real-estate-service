'use client';

import type { DistrictStat } from '../types';

/**
 * 구별 칩 가로 스크롤 — 사이클 W (아실형)
 *
 * 구명 + 최근 1개월 건수, 신고가 있으면 red dot 뱃지.
 * 데이터는 부모가 /api/transactions/districts 로 조회해 전달.
 * stats 미도착(로딩) 시 구명만으로 렌더해 즉시 조작 가능.
 */

interface DistrictChipsProps {
  districts: string[];             // 그룹 내 구 목록 (fallback 순서)
  stats:     DistrictStat[] | null; // API 결과 (건수순 정렬) — null 이면 로딩
  active:    string;
  onPick:    (district: string) => void;
}

function shortName(district: string): string {
  return district.replace(/^(부산|인천|대구|울산|대전|광주) /, '');
}

export default function DistrictChips({ districts, stats, active, onPick }: DistrictChipsProps) {
  // stats 있으면 건수순, 없으면 정의 순서
  const items: { district: string; count: number | null; newHighs: number }[] = stats
    ? stats.map((s) => ({ district: s.district, count: s.count, newHighs: s.newHighs }))
    : districts.map((d) => ({ district: d, count: null, newHighs: 0 }));

  return (
    <div
      role="tablist"
      aria-label="구 선택"
      style={{
        display: 'flex', gap: '8px', overflowX: 'auto',
        paddingBottom: '8px', marginBottom: '16px',
        scrollbarWidth: 'thin',
      }}
    >
      {items.map(({ district, count, newHighs }) => {
        const isActive = district === active;
        return (
          <button
            key={district}
            role="tab"
            aria-selected={isActive}
            onClick={() => onPick(district)}
            style={{
              flexShrink: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              padding: '10px 16px', borderRadius: '12px',
              backgroundColor: isActive ? 'var(--ink, #14213D)' : 'var(--bg-card)',
              color: isActive ? '#FFFFFF' : 'var(--text-primary)',
              border: `1px solid ${isActive ? 'var(--ink, #14213D)' : 'var(--border)'}`,
              cursor: 'pointer', transition: 'background-color 0.15s',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>
              {shortName(district)}
            </span>
            <span style={{
              fontSize: '12px', fontWeight: 600, fontFamily: 'Roboto Mono, monospace',
              color: isActive ? 'rgba(255,255,255,0.75)' : 'var(--text-dim)',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}>
              {count !== null ? count : '·'}
              {newHighs > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                  <span style={{
                    width: '5px', height: '5px', borderRadius: '50%',
                    backgroundColor: 'var(--up-color, #C92F2F)', display: 'inline-block',
                  }} />
                  <span style={{ color: isActive ? '#FFB3B3' : 'var(--up-color, #C92F2F)', fontSize: '11px' }}>
                    {newHighs}
                  </span>
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
