'use client';

import { Calendar, Home, Users, TrendingUp } from 'lucide-react';
import type { SubscriptionItem } from '@/lib/types';
import dayjs from 'dayjs';

interface Props {
  item: SubscriptionItem;
}

const STATUS_CONFIG = {
  upcoming: { label: '청약 예정', color: 'var(--accent)', bg: 'var(--accent-bg)' },
  ongoing:  { label: '청약 중',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  closed:   { label: '청약 마감', color: 'var(--text-dim)', bg: 'rgba(100,116,139,0.12)'},
};

function formatPrice(manwon: number | null): string {
  if (!manwon) return '미정';
  return `${(manwon / 10000).toFixed(0)}억`;
}

function getDday(endDate: string): string {
  const diff = dayjs(endDate).diff(dayjs(), 'day');
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-day';
  return `D-${diff}`;
}

export default function SubscriptionCard({ item }: Props) {
  const sc = STATUS_CONFIG[item.status];
  const dday = getDday(item.endDate);

  return (
    <div style={{
      padding: '20px',
      borderRadius: '16px',
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
    }}>
      {/* 상단: 상태 + D-day */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          padding: '4px 12px', borderRadius: '999px',
          fontSize: '12px', fontWeight: 600,
          backgroundColor: sc.bg, color: sc.color,
        }}>
          {sc.label}
        </span>
        {item.status !== 'closed' && (
          <span style={{
            fontSize: '12px', fontWeight: 700,
            fontFamily: 'Roboto Mono, monospace',
            color: item.status === 'ongoing' ? '#22C55E' : 'var(--accent)',
          }}>
            {dday}
          </span>
        )}
      </div>

      {/* 단지명 */}
      <div>
        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {item.name}
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{item.address}</p>
      </div>

      {/* 메타 정보 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Calendar size={12} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {item.startDate} ~ {item.endDate}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Home size={12} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {item.totalUnits.toLocaleString()}세대 · {item.houseType}
          </span>
        </div>
      </div>

      {/* 하단: 경쟁률 + 분양가 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: '12px', borderTop: '1px solid var(--border-light)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Users size={12} style={{ color: 'var(--text-dim)' }} />
          {item.competitionRate !== null ? (
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#22C55E' }}>
              {item.competitionRate}:1
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>경쟁률 미발표</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <TrendingUp size={12} style={{ color: '#F59E0B' }} />
          <span style={{
            fontSize: '13px', fontWeight: 700,
            fontFamily: 'Roboto Mono, monospace', color: '#F59E0B',
          }}>
            {formatPrice(item.minPrice)} ~ {formatPrice(item.maxPrice)}
          </span>
        </div>
      </div>
    </div>
  );
}