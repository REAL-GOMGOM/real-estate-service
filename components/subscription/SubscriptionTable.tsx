'use client';

import { Calendar, Home, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { SubscriptionItem } from '@/lib/types';
import dayjs from 'dayjs';

interface Props {
  items: SubscriptionItem[];
  onSelect: (item: SubscriptionItem) => void;
}

const STATUS_CONFIG = {
  upcoming: { label: '청약 예정', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  ongoing:  { label: '청약 중',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  closed:   { label: '청약 마감', color: '#64748B', bg: 'rgba(100,116,139,0.12)'},
};

function formatPrice(manwon: number | null): string {
  if (!manwon) return '미정';
  return `${(manwon / 10000).toFixed(0)}억`;
}

function getDday(endDate: string, status: string, now: ReturnType<typeof dayjs>): string {
  if (status === 'closed') return '-';
  const diff = dayjs(endDate).diff(now, 'day');
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-day';
  return `D-${diff}`;
}

export default function SubscriptionTable({ items, onSelect }: Props) {
  const [now, setNow] = useState(() => dayjs('2000-01-01'));
  useEffect(() => { setNow(dayjs()); }, []);

  if (items.length === 0) {
    return (
      <div style={{
        padding: '80px 24px',
        textAlign: 'center',
        color: '#475569',
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
              backgroundColor: '#0F1629',
              border: '1px solid rgba(255,255,255,0.08)',
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
              <p style={{ flex: 1, fontSize: '14px', fontWeight: 700, color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name}
              </p>
              {item.status !== 'closed' && (
                <span style={{
                  fontSize: '13px', fontWeight: 800, flexShrink: 0,
                  fontFamily: 'Roboto Mono, monospace',
                  color: item.status === 'ongoing' ? '#22C55E' : '#3B82F6',
                }}>
                  {dday}
                </span>
              )}
            </div>

            {/* 2행: 주소 */}
            <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px' }}>
              {item.district}{item.houseType ? ` · ${item.houseType}` : ''}
            </p>

            {/* 3행: 날짜 / 세대수 / 경쟁률 / 분양가 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={11} style={{ color: '#475569', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                  {item.startDate} ~ {item.endDate}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Home size={11} style={{ color: '#475569', flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: '#94A3B8', whiteSpace: 'nowrap' }}>
                  {item.totalUnits.toLocaleString()}세대
                </span>
              </div>
              {item.competitionRate !== null ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Users size={11} style={{ color: '#22C55E', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#22C55E', whiteSpace: 'nowrap' }}>
                    {item.competitionRate}:1
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: '#475569' }}>경쟁률 미발표</span>
              )}
              <span style={{
                fontSize: '13px', fontWeight: 700,
                fontFamily: 'Roboto Mono, monospace', color: '#F59E0B', whiteSpace: 'nowrap',
              }}>
                {formatPrice(item.minPrice)} ~ {formatPrice(item.maxPrice)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}