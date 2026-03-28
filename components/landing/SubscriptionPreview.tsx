'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { ArrowRight, Calendar, Home, Users } from 'lucide-react';
import type { SubscriptionItem } from '@/lib/types';
import SubscriptionDetailModal from '@/components/subscription/SubscriptionDetailModal';

interface Props {
  items: SubscriptionItem[];
}

const STATUS_CONFIG = {
  upcoming: { label: '청약 예정', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  ongoing:  { label: '청약 중',   color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  closed:   { label: '청약 마감', color: 'var(--text-dim)', bg: 'rgba(100,116,139,0.12)'},
};

function formatPrice(manwon: number | null): string {
  if (!manwon) return '미정';
  return `${(manwon / 10000).toFixed(0)}억`;
}

export default function SubscriptionPreview({ items }: Props) {
  const [selectedItem, setSelectedItem] = useState<SubscriptionItem | null>(null);

  return (
    <section style={{ padding: '96px 0', backgroundColor: 'var(--bg-card)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>

        {/* 섹션 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', marginBottom: '48px' }}
        >
          <div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>청약 정보</h2>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>수도권 주요 청약 일정</p>
          </div>
          <Link href="/subscription" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600, color: '#3B82F6', textDecoration: 'none' }}>
            전체 일정 보기 <ArrowRight size={16} />
          </Link>
        </motion.div>

        {/* 청약 카드 리스트 */}
        {items.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-dim)', textAlign: 'center', padding: '40px 0' }}>
            현재 표시할 청약 정보가 없습니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {items.map((item, index) => {
              const sc = STATUS_CONFIG[item.status];
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  onClick={() => setSelectedItem(item)}
                  style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px', padding: '24px', borderRadius: '16px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer' }}
                >
                  {/* 상태 */}
                  <span style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, flexShrink: 0, backgroundColor: sc.bg, color: sc.color }}>
                    {sc.label}
                  </span>

                  {/* 단지명 */}
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>{item.name}</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{item.address}</p>
                  </div>

                  {/* 메타 정보 */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={13} style={{ color: 'var(--text-dim)' }} />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.startDate} ~ {item.endDate}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Home size={13} style={{ color: 'var(--text-dim)' }} />
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{item.totalUnits.toLocaleString()}세대{item.houseType ? ` · ${item.houseType}` : ''}</span>
                    </div>
                    {item.competitionRate !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={13} style={{ color: '#22C55E' }} />
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#22C55E' }}>{item.competitionRate}:1</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>경쟁률 미발표</span>
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'Roboto Mono, monospace', color: '#F59E0B' }}>
                      {formatPrice(item.minPrice)} ~ {formatPrice(item.maxPrice)}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {selectedItem && (
        <SubscriptionDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </section>
  );
}
