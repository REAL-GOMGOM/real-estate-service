import type { SubscriptionItem } from '@/lib/types';
import type { Subscription } from '@/components/landing/SubscriptionList';

const STATUS_MAP: Record<SubscriptionItem['status'], Subscription['status']> = {
  ongoing: '청약 중',
  upcoming: '청약 예정',
  closed: '청약 마감',
};

export function toSubscription(raw: SubscriptionItem): Subscription {
  const period =
    raw.startDate && raw.endDate
      ? `${raw.startDate} ~ ${raw.endDate}`
      : '미정';

  const comp =
    raw.competitionRate !== null && raw.competitionRate > 0
      ? `${raw.competitionRate}:1`
      : '미발표';

  return {
    status: STATUS_MAP[raw.status],
    name: raw.name,
    loc: raw.address || raw.district || '미정',
    period,
    units: raw.totalUnits,
    comp,
  };
}
