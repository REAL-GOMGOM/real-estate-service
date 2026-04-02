'use client';

import { useState, useMemo } from 'react';
import { List, CalendarDays } from 'lucide-react';
import SubscriptionFilter from '@/components/subscription/SubscriptionFilter';
import SubscriptionTable from '@/components/subscription/SubscriptionTable';
import SubscriptionDetailModal from '@/components/subscription/SubscriptionDetailModal';
import SubscriptionCalendar from '@/components/subscription/SubscriptionCalendar';
import type { SubscriptionItem } from '@/lib/types';
import { matchesQuery } from '@/lib/search-utils';

interface Props {
  items: SubscriptionItem[];
}

const STATUS_ORDER = { ongoing: 0, upcoming: 1, closed: 2 } as const;

export default function SubscriptionClientPage({ items }: Props) {
  const [viewMode,         setViewMode]         = useState<'list' | 'calendar'>('calendar');
  const [selectedStatus,   setSelectedStatus]   = useState('전체');
  const [selectedDistrict, setSelectedDistrict] = useState('전체');
  const [searchQuery,      setSearchQuery]      = useState('');
  const [selectedItem,     setSelectedItem]     = useState<SubscriptionItem | null>(null);

  const districts = useMemo(
    () => Array.from(new Set(items.map((i) => i.district).filter(Boolean))).sort(),
    [items],
  );

  const stats = useMemo(() => {
    function formatDate(d: string): string {
      if (!d || d.length < 10) return '';
      return d.slice(2, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8, 10);
    }
    function dateRange(list: SubscriptionItem[]): string {
      const starts = list.map((i) => i.startDate).filter(Boolean).sort();
      const ends   = list.map((i) => i.endDate).filter(Boolean).sort();
      if (starts.length === 0) return '';
      return `${formatDate(starts[0])} ~ ${formatDate(ends[ends.length - 1])}`;
    }
    const ongoing  = items.filter((i) => i.status === 'ongoing');
    const upcoming = items.filter((i) => i.status === 'upcoming');
    const closed   = items.filter((i) => i.status === 'closed');
    return [
      { label: '전체',     value: items.length,    color: 'var(--text-primary)', range: dateRange(items) },
      { label: '청약 중',  value: ongoing.length,  color: '#22C55E',             range: dateRange(ongoing) },
      { label: '청약 예정', value: upcoming.length, color: 'var(--accent)',       range: dateRange(upcoming) },
      { label: '청약 마감', value: closed.length,   color: 'var(--text-dim)',     range: dateRange(closed) },
    ];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const statusMatch   = selectedStatus   === '전체' || item.status   === selectedStatus;
        const districtMatch = selectedDistrict === '전체' || item.district === selectedDistrict;
        const searchMatch   = searchQuery === '' || matchesQuery(item.name, searchQuery);
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
              {stat.range && (
                <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px', fontFamily: 'Roboto Mono, monospace' }}>
                  {stat.range}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* 뷰 모드 토글 */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', padding: '4px', borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', width: 'fit-content' }}>
          {([
            { mode: 'calendar' as const,  icon: <CalendarDays size={15} />, label: '달력' },
            { mode: 'list' as const,     icon: <List size={15} />,         label: '목록' },
          ]).map(({ mode, icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: 'none', cursor: 'pointer',
                backgroundColor: viewMode === mode ? 'var(--accent)' : 'transparent',
                color: viewMode === mode ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {icon} {label}
            </button>
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

        {viewMode === 'list' ? (
          <SubscriptionTable items={filteredItems} onSelect={setSelectedItem} />
        ) : (
          <SubscriptionCalendar items={filteredItems} onSelect={setSelectedItem} />
        )}

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
