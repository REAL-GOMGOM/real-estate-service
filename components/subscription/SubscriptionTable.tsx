'use client';

import { Calendar, Home, Users } from 'lucide-react';
import { useMemo } from 'react';
import type { SubscriptionItem } from '@/lib/types';
import { useMounted } from '@/hooks/useMounted';
import { formatSubscriptionDday } from '@/lib/subscription-date';

interface Props {
  items: SubscriptionItem[];
  onSelect: (item: SubscriptionItem) => void;
}

const STATUS_CONFIG = {
  upcoming: { label: '청약 예정', color: 'var(--accent)', bg: 'var(--accent-bg)' },
  ongoing:  { label: '청약 중',   color: '#2E7A4C', bg: 'rgba(111,192,138,0.12)'  },
  closed:   { label: '청약 마감', color: 'var(--text-dim)', bg: 'rgba(100,116,139,0.12)'},
};

function getDday(endDate: string, status: string, now: Date): string {
  if (status === 'closed') return '-';
  return formatSubscriptionDday(endDate, now) ?? '일정 확인';
}

export default function SubscriptionTable({ items, onSelect }: Props) {
  // SSR/하이드레이션에서는 고정 기준일, 마운트 후 실제 현재 시각으로 파생
  const mounted = useMounted();
  const now = useMemo(() => (mounted ? new Date() : new Date('2000-01-01T00:00:00.000Z')), [mounted]);

  if (items.length === 0) {
    return (
      <div style={{
        padding: 'clamp(32px, 6vw, 80px) 24px',
        textAlign: 'center',
        color: 'var(--text-dim)',
        fontSize: '14px',
      }}>
        조건에 맞는 청약 정보가 없습니다.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map((item) => {
        const sc = STATUS_CONFIG[item.status];
        const dday = getDday(item.endDate, item.status, now);

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            style={{
              padding: '16px 20px',
              borderRadius: '16px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            {/* 1행: 상태 배지 + 단지명 + D-day */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{
                padding: '4px 10px', borderRadius: '999px', flexShrink: 0,
                fontSize: '11px', fontWeight: 600,
                backgroundColor: sc.bg, color: sc.color,
              }}>
                {sc.label}
              </span>
              <p style={{ flex: 1, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </p>
              {item.status !== 'closed' && (
                <span style={{
                  fontSize: '13px', fontWeight: 800, flexShrink: 0,
                  fontFamily: 'Roboto Mono, monospace',
                  color: item.status === 'ongoing' ? '#2E7A4C' : 'var(--accent)',
                }}>
                  {dday}
                </span>
              )}
            </div>

            {/* 2행: 주소 */}
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '10px' }}>
              {item.district}{item.houseType ? ` · ${item.houseType}` : ''}
            </p>

            {/* 3행: 날짜 / 세대수 / 경쟁률 / 분양가 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {item.startDate} ~ {item.endDate}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Home size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {item.totalUnits !== null ? `${item.totalUnits.toLocaleString()}세대` : '세대수 미표기'}
                </span>
              </div>
              {item.competitionRates.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Users size={11} style={{ color: '#2E7A4C', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#2E7A4C', whiteSpace: 'nowrap' }}>
                    {item.competitionRates.length}개 주택형 공시
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>경쟁률 미발표</span>
              )}
              <span style={{ fontSize: '12px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                분양가: 청약홈 공고 확인
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
