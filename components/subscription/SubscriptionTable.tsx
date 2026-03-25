'use client';

import { Calendar, Home, Users } from 'lucide-react';
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

function getDday(endDate: string, status: string): string {
  if (status === 'closed') return '-';
  const diff = dayjs(endDate).diff(dayjs(), 'day');
  if (diff < 0) return '마감';
  if (diff === 0) return 'D-day';
  return `D-${diff}`;
}

export default function SubscriptionTable({ items, onSelect }: Props) {
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
        const dday = getDday(item.endDate, item.status);

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '16px',
              padding: '20px 24px',
              borderRadius: '16px',
              backgroundColor: '#0F1629',
              border: '1px solid rgba(255,255,255,0.08)',
              transition: 'border-color 0.15s',
              cursor: 'pointer',
            }}
          >
            {/* 상태 배지 */}
            <div style={{ flexShrink: 0, width: '80px' }}>
              <span style={{
                display: 'inline-block',
                padding: '5px 10px', borderRadius: '999px',
                fontSize: '11px', fontWeight: 600,
                backgroundColor: sc.bg, color: sc.color,
              }}>
                {sc.label}
              </span>
            </div>

            {/* 단지명 + 주소 */}
            <div style={{ flex: 2, minWidth: '180px' }}>
              <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '3px' }}>
                {item.name}
              </p>
              <p style={{ fontSize: '12px', color: '#64748B' }}>{item.district} · {item.houseType}</p>
            </div>

            {/* 청약 기간 */}
            <div style={{ flex: 1, minWidth: '140px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                <Calendar size={12} style={{ color: '#475569' }} />
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>청약기간</span>
              </div>
              <p style={{ fontSize: '12px', color: '#F1F5F9' }}>
                {item.startDate} ~ {item.endDate}
              </p>
            </div>

            {/* 세대수 */}
            <div style={{ flexShrink: 0, minWidth: '80px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                <Home size={12} style={{ color: '#475569' }} />
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>세대수</span>
              </div>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>
                {item.totalUnits.toLocaleString()}세대
              </p>
            </div>

            {/* 경쟁률 */}
            <div style={{ flexShrink: 0, minWidth: '80px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                <Users size={12} style={{ color: '#475569' }} />
                <span style={{ fontSize: '12px', color: '#94A3B8' }}>경쟁률</span>
              </div>
              {item.competitionRate !== null ? (
                <p style={{ fontSize: '13px', fontWeight: 700, color: '#22C55E' }}>
                  {item.competitionRate}:1
                </p>
              ) : (
                <p style={{ fontSize: '12px', color: '#475569' }}>미발표</p>
              )}
            </div>

            {/* 분양가 */}
            <div style={{ flexShrink: 0, minWidth: '120px' }}>
              <p style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '3px' }}>분양가</p>
              <p style={{
                fontSize: '13px', fontWeight: 700,
                fontFamily: 'Roboto Mono, monospace', color: '#F59E0B',
              }}>
                {formatPrice(item.minPrice)} ~ {formatPrice(item.maxPrice)}
              </p>
            </div>

            {/* D-day */}
            {item.status !== 'closed' && (
              <div style={{ flexShrink: 0, minWidth: '50px', textAlign: 'right' }}>
                <span style={{
                  fontSize: '14px', fontWeight: 800,
                  fontFamily: 'Roboto Mono, monospace',
                  color: item.status === 'ongoing' ? '#22C55E' : '#3B82F6',
                }}>
                  {dday}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}