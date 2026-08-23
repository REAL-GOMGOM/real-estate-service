import { kstTodayIso } from '@/lib/agg-window';

export type SubscriptionStatus = 'upcoming' | 'ongoing' | 'closed';

/** 청약홈 날짜를 검증된 YYYY-MM-DD 달력일로 정규화한다. */
export function normalizeSubscriptionDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.trim().replace(/\D/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function deriveSubscriptionStatus(
  startDate: string,
  endDate: string,
  now: Date = new Date(),
): SubscriptionStatus | null {
  return deriveSubscriptionStatusOnDate(startDate, endDate, kstTodayIso(now));
}

export function deriveSubscriptionStatusOnDate(
  startDate: string,
  endDate: string,
  todayDate: string,
): SubscriptionStatus | null {
  const start = normalizeSubscriptionDate(startDate);
  const end = normalizeSubscriptionDate(endDate);
  const today = normalizeSubscriptionDate(todayDate);
  if (!start || !end || !today || start > end) return null;
  if (today < start) return 'upcoming';
  if (today > end) return 'closed';
  return 'ongoing';
}

/** 시각 차이가 아닌 KST 달력일 차이. 잘못된 날짜에는 null을 반환한다. */
export function subscriptionDday(endDate: string, now: Date = new Date()): number | null {
  const end = normalizeSubscriptionDate(endDate);
  if (!end) return null;
  const today = kstTodayIso(now);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  const todayTime = Date.parse(`${today}T00:00:00Z`);
  return Math.round((endTime - todayTime) / 86_400_000);
}

export function formatSubscriptionDday(endDate: string, now: Date = new Date()): string | null {
  const days = subscriptionDday(endDate, now);
  if (days === null || days < 0) return null;
  return days === 0 ? 'D-day' : `D-${days}`;
}
