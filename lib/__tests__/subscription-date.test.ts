import { describe, expect, it } from 'vitest';
import {
  deriveSubscriptionStatus,
  formatSubscriptionDday,
  normalizeSubscriptionDate,
} from '@/lib/subscription-date';

describe('청약 KST 달력일', () => {
  it('형식과 실제 달력일을 모두 검증한다', () => {
    expect(normalizeSubscriptionDate('20260809')).toBe('2026-08-09');
    expect(normalizeSubscriptionDate('2026-08-09')).toBe('2026-08-09');
    expect(normalizeSubscriptionDate('2026-02-30')).toBeNull();
    expect(normalizeSubscriptionDate('')).toBeNull();
  });

  it('KST 자정 이후에는 UTC 전날이더라도 오늘로 판정한다', () => {
    const now = new Date('2026-08-08T15:30:00.000Z');
    expect(deriveSubscriptionStatus('2026-08-09', '2026-08-09', now)).toBe('ongoing');
    expect(formatSubscriptionDday('2026-08-09', now)).toBe('D-day');
    expect(formatSubscriptionDday('2026-08-10', now)).toBe('D-1');
  });

  it('날짜 누락·역전은 예정으로 위장하지 않는다', () => {
    expect(deriveSubscriptionStatus('', '2026-08-10')).toBeNull();
    expect(deriveSubscriptionStatus('2026-08-11', '2026-08-10')).toBeNull();
    expect(formatSubscriptionDday('')).toBeNull();
  });
});
