'use client';

import { useState, useMemo } from 'react';
import SubscriptionFilter from '@/components/subscription/SubscriptionFilter';
import SubscriptionTable from '@/components/subscription/SubscriptionTable';
import SubscriptionDetailModal from '@/components/subscription/SubscriptionDetailModal';
import type { SubscriptionItem } from '@/lib/types';

interface Props {
  items: SubscriptionItem[];
}

const STATUS_ORDER = { ongoing: 0, upcoming: 1, closed: 2 } as const;

export default function SubscriptionClientPage({ items }: Props) {
  const [selectedStatus,   setSelectedStatus]   = useState('전체');
  const [selectedDistrict, setSelectedDistrict] = useState('전체');
  const [searchQuery,      setSearchQuery]      = useState('');
  const [selectedItem,     setSelectedItem]     = useState<SubscriptionItem | null>(null);

  const districts = useMemo(
    () => Array.from(new Set(items.map((i) => i.district).filter(Boolean))).sort(),
    [items],
  );

  const stats = useMemo(() => [
    { label: '전체',     value: items.length,                                         color: 'var(--text-primary)' },
    { label: '청약 중',  value: items.filter((i) => i.status === 'ongoing').length,   color: '#22C55E' },
    { label: '청약 예정', value: items.filter((i) => i.status === 'upcoming').length, color: 'var(--accent)' },
    { label: '청약 마감', value: items.filter((i) => i.status === 'closed').length,   color: 'var(--text-dim)' },
  ], [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const statusMatch   = selectedStatus   === '전체' || item.status   === selectedStatus;
        const districtMatch = selectedDistrict === '전체' || item.district === selectedDistrict;
        const searchMatch   = searchQuery === '' || item.name.includes(searchQuery);
        return statusMatch && districtMatch && searchMatch;
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [items, selectedStatus, selectedDistrict, searchQuery]);

  return (
    <main style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)', paddingTop: '64px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px' }}>

        {/* 페이지 헤더 */}
        <div style={{ marginBottom: '40px' }}>
          <h1 style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            청약 정보
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)' }}>
            수도권 주요 청약 일정 · 경쟁률 · 분양가 정보
          </p>
        </div>

        {/* 요약 통계 카드 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}>
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: '20px 24px',
                borderRadius: '16px',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border)',
              }}
            >
              <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '8px' }}>{stat.label}</p>
              <p style={{
                fontSize: '28px', fontWeight: 800,
                fontFamily: 'Roboto Mono, monospace',
                color: stat.color,
              }}>
                {stat.value}
                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dim)', marginLeft: '4px' }}>건</span>
              </p>
            </div>
          ))}
        </div>

        {/* 필터 */}
        <SubscriptionFilter
          selectedStatus={selectedStatus}
          selectedDistrict={selectedDistrict}
          searchQuery={searchQuery}
          onStatusChange={setSelectedStatus}
          onDistrictChange={setSelectedDistrict}
          onSearchChange={setSearchQuery}
          districts={districts}
        />

        {/* 결과 카운트 */}
        <p style={{ fontSize: '13px', color: 'var(--text-dim)', marginBottom: '16px' }}>
          총 <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{filteredItems.length}</span>건
        </p>

        {/* 청약 목록 */}
        <SubscriptionTable items={filteredItems} onSelect={setSelectedItem} />

        {/* 상세 모달 */}
        {selectedItem && (
          <SubscriptionDetailModal
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
          />
        )}

        {/* 면책 문구 */}
        <p style={{
          marginTop: '48px', padding: '16px 20px',
          borderRadius: '12px', backgroundColor: 'var(--border-light)',
          fontSize: '12px', color: 'var(--text-dim)', lineHeight: 1.8,
        }}>
          ※ 본 페이지의 청약 정보는 한국부동산원 청약홈 공공데이터를 기반으로 합니다. 실제 청약 신청은
          <a
            href="https://www.applyhome.co.kr"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)', marginLeft: '4px' }}
          >
            청약홈(applyhome.co.kr)
          </a>에서 확인하세요.
        </p>
      </div>
    </main>
  );
}
