'use client';

import { useState, useMemo } from 'react';
import { List, CalendarDays } from 'lucide-react';
import SubscriptionFilter from '@/components/subscription/SubscriptionFilter';
import SubscriptionTable from '@/components/subscription/SubscriptionTable';
import SubscriptionDetailModal from '@/components/subscription/SubscriptionDetailModal';
import SubscriptionCalendar from '@/components/subscription/SubscriptionCalendar';
import type { SubscriptionItem } from '@/lib/types';
import type { SubscriptionCoverage } from '@/lib/subscription-api';
import { matchesQuery } from '@/lib/search-utils';
import { TrackedTelegramLink } from '@/components/shared/TrackedTelegramLink';

interface Props {
  items: SubscriptionItem[];
  dataStatus?: 'ok' | 'partial' | 'degraded';
  note?: string;
  coverage?: SubscriptionCoverage;
}

const STATUS_ORDER = { ongoing: 0, upcoming: 1, closed: 2 } as const;

export default function SubscriptionClientPage({
  items,
  dataStatus = 'ok',
  note,
  coverage,
}: Props) {
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
      { label: '청약 중',  value: ongoing.length,  color: '#2E7A4C',             range: dateRange(ongoing) },
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
            진행·예정 공고 전체와 최근 180일 마감 공고의 일정·공시 경쟁률을 확인하세요. 출처: 한국부동산원 청약홈
          </p>
        </div>

        {dataStatus === 'degraded' ? (
          <section
            role="status"
            style={{
              padding: '24px',
              borderRadius: '16px',
              backgroundColor: '#FFF8F7',
              border: '1px solid #F2D7D5',
              marginBottom: '32px',
            }}
          >
            <h2 style={{ margin: 0, fontSize: '17px', color: '#8A2C25' }}>
              청약 데이터를 잠시 불러오지 못했습니다.
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: '14px', lineHeight: 1.7, color: 'var(--text-muted)' }}>
              임시 공고를 대신 표시하지 않습니다. 잠시 후 새로고침하거나 청약홈 원문에서 확인해 주세요.
            </p>
            <a
              href="https://www.applyhome.co.kr"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-block', marginTop: '14px', color: 'var(--accent)', fontWeight: 700 }}
            >
              청약홈에서 확인하기 →
            </a>
          </section>
        ) : (
          <>
            {dataStatus === 'partial' && (
              <section
                role="status"
                style={{
                  padding: '16px 18px',
                  borderRadius: '14px',
                  backgroundColor: '#FFF9EC',
                  border: '1px solid #E9D39C',
                  marginBottom: '24px',
                  color: '#71551C',
                }}
              >
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>
                  현재 수집된 일부 공고만 표시합니다.
                </p>
                <p style={{ margin: '6px 0 0', fontSize: '12px', lineHeight: 1.6 }}>
                  {note ?? '일부 청약홈 자료가 응답하지 않았습니다.'}
                  {coverage && ` (${coverage.successfulEndpoints}/${coverage.requestedEndpoints}개 자료 호출 성공)`}
                </p>
              </section>
            )}
            {coverage?.displayWindowStart && (
              <p style={{ margin: '-10px 0 22px', fontSize: '12px', color: 'var(--text-dim)' }}>
                표시 범위: 진행·예정 공고 전체 · 마감일 {coverage.displayWindowStart} 이후 공고
                {coverage.historicalRowsExcluded > 0 && ` · 이전 마감 ${coverage.historicalRowsExcluded.toLocaleString()}건 제외`}
              </p>
            )}
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
        <div role="group" aria-label="청약 정보 보기 방식" style={{ display: 'flex', gap: '4px', marginBottom: '24px', padding: '4px', borderRadius: '12px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', width: 'fit-content' }}>
          {([
            { mode: 'calendar' as const,  icon: <CalendarDays size={15} />, label: '달력' },
            { mode: 'list' as const,     icon: <List size={15} />,         label: '목록' },
          ]).map(({ mode, icon, label }) => (
            <button
              type="button"
              key={mode}
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
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
          </>
        )}

        <section style={{ marginTop: '36px', padding: '20px', borderRadius: '16px', background: '#EEF3FF', border: '1px solid #D8E2FF', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)' }}>
              새 청약·주요 부동산 소식 받아보기
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              운영 일정에 따라 선별한 소식을 내집 텔레그램 채널에서 전합니다.
            </p>
          </div>
          <TrackedTelegramLink
            href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || 'https://t.me/realMyzip'}
            placement="subscription_inline_cta"
            style={{ padding: '11px 16px', borderRadius: '10px', background: '#1B4DDB', color: '#FFFFFF', fontSize: '13px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            채널 참여하기 →
          </TrackedTelegramLink>
        </section>

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
          </a>에서 공고문·분양가·접수 조건을 다시 확인하세요. 화면 성능을 위해 마감 공고는 최근 180일만 표시하며,
          API에서 의미가 명확히 확인되지 않은 가격 필드는 표시하지 않습니다.
        </p>
      </div>
    </main>
  );
}
