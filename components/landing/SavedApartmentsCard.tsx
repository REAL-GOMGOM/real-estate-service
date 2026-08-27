'use client';

import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Clock3, Heart } from 'lucide-react';
import {
  decodeApartmentRetentionSnapshot,
  getApartmentRetentionSnapshot,
  subscribeApartmentRetention,
} from '@/lib/apartment-retention';

export default function SavedApartmentsCard() {
  const snapshot = useSyncExternalStore(
    subscribeApartmentRetention,
    getApartmentRetentionSnapshot,
    () => '',
  );
  const { favorites, recent } = useMemo(
    () => decodeApartmentRetentionSnapshot(snapshot),
    [snapshot],
  );
  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);
  const apartments = useMemo(
    () => [...favorites, ...recent.filter((item) => !favoriteIds.has(item.id))].slice(0, 4),
    [favorites, recent, favoriteIds],
  );

  if (apartments.length === 0) return null;

  return (
    <section style={{ background: '#F5F6FA', borderBottom: '1px solid #EEF0F5' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 24px 2px' }}>
        <div style={{
          border: '1px solid #E1E5EC', borderRadius: 16, background: '#FFFFFF', padding: '16px 18px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0B1524' }}>내 단지 다시 보기</h2>
            <span style={{ fontSize: 11.5, color: '#8A93A3' }}>이 기기에만 저장돼요</span>
          </div>
          <div style={{ display: 'flex', gap: 9, overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: 2 }}>
            {apartments.map((apartment) => {
              const favorite = favoriteIds.has(apartment.id);
              return (
                <Link
                  key={apartment.id}
                  href={`/apt/${encodeURIComponent(apartment.id)}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, minWidth: 190, maxWidth: 260,
                    padding: '11px 12px', borderRadius: 11, border: '1px solid #EEF0F5',
                    background: '#FCFDFE', textDecoration: 'none', flexShrink: 0,
                  }}
                >
                  {favorite
                    ? <Heart size={15} color="#1B4DDB" fill="#1B4DDB" aria-label="관심 단지" />
                    : <Clock3 size={15} color="#8A93A3" aria-label="최근 본 단지" />}
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#0B1524', fontSize: 13 }}>
                      {apartment.name}
                    </strong>
                    <span style={{ display: 'block', marginTop: 2, color: '#8A93A3', fontSize: 11.5 }}>
                      {apartment.district}{apartment.dong ? ` · ${apartment.dong}` : ''}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
