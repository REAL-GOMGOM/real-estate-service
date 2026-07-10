import type { SubscriptionItem } from '@/lib/types';

/** 청약 카드 표시용 모델 — 구 SubscriptionList 컴포넌트 삭제(07-11)로 타입을 이곳으로 이전 */
export interface Subscription {
  status: '청약 중' | '청약 예정' | '청약 마감';
  name:   string;
  loc:    string;
  period: string;
  units:  number;
  comp:   string;
}

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
