'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Bell, Heart } from 'lucide-react';
import { TrackedTelegramLink } from '@/components/shared/TrackedTelegramLink';
import {
  decodeApartmentRetentionSnapshot,
  getApartmentRetentionSnapshot,
  rememberApartment,
  subscribeApartmentRetention,
  toggleFavoriteApartment,
  type RetainedApartmentInput,
} from '@/lib/apartment-retention';
import { trackAnalyticsEvent } from '@/lib/cookie-consent';

type ApartmentRetentionActionsProps = RetainedApartmentInput;

export default function ApartmentRetentionActions(apartment: ApartmentRetentionActionsProps) {
  const retainedApartment = useMemo(() => ({
    id: apartment.id,
    name: apartment.name,
    district: apartment.district,
    dong: apartment.dong,
  }), [apartment.id, apartment.name, apartment.district, apartment.dong]);
  const snapshot = useSyncExternalStore(
    subscribeApartmentRetention,
    getApartmentRetentionSnapshot,
    () => '',
  );
  const favorites = useMemo(
    () => decodeApartmentRetentionSnapshot(snapshot).favorites,
    [snapshot],
  );
  const isFavorite = favorites.some((item) => item.id === apartment.id);

  useEffect(() => {
    rememberApartment(retainedApartment);
  }, [retainedApartment]);

  function handleFavorite() {
    const next = toggleFavoriteApartment(retainedApartment);
    if (!next.persisted) return;
    trackAnalyticsEvent('apartment_favorite_change', {
      action: next.isFavorite ? 'add' : 'remove',
    });
  }

  return (
    <section
      aria-label="단지 저장과 알림"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        flexWrap: 'wrap', marginBottom: 18, padding: '12px 14px', borderRadius: 12,
        border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          aria-pressed={isFavorite}
          onClick={handleFavorite}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 12px',
            borderRadius: 9, border: `1px solid ${isFavorite ? 'var(--accent)' : 'var(--border)'}`,
            backgroundColor: isFavorite ? 'var(--accent-bg)' : 'transparent',
            color: isFavorite ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Heart size={15} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          {isFavorite ? '관심 단지 저장됨' : '관심 단지 저장'}
        </button>
        <TrackedTelegramLink
          href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL || 'https://t.me/realMyzip'}
          placement="apt_detail_retention"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 12px',
            borderRadius: 9, backgroundColor: 'var(--accent)', color: '#FFFFFF',
            fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}
        >
          <Bell size={15} aria-hidden="true" />
          주요 실거래 알림 받기
        </TrackedTelegramLink>
      </div>
      <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-dim)' }}>
        저장은 이 기기에만 · 텔레그램은 전국 주요 거래를 선별해 알려드려요.
      </span>
    </section>
  );
}
