/** 부동산 달력 관련 타입 정의 */

export type EventCategory =
  | 'subscription'
  | 'rate'
  | 'move_in'
  | 'policy'
  | 'loan'
  | 'index'
  | 'other';

export type Importance = 'high' | 'normal' | 'low';

export interface CalendarEvent {
  id: number;
  event_date: string; // "2026-03-27"
  category: EventCategory;
  title: string;
  description: string | null;
  source_url: string | null;
  icon: string | null;
  importance: Importance;
}

export interface CategoryInfo {
  key: EventCategory;
  label: string;
  color: string;
  icon: string;
}

export const CATEGORY_MAP: Record<EventCategory, CategoryInfo> = {
  subscription: { key: 'subscription', label: '청약', color: '#EF4444', icon: '🏠' },
  rate:         { key: 'rate',         label: '금리', color: '#3B82F6', icon: '🏦' },
  move_in:      { key: 'move_in',      label: '입주', color: '#22C55E', icon: '🏗️' },
  policy:       { key: 'policy',       label: '정책', color: '#F97316', icon: '📋' },
  loan:         { key: 'loan',         label: '대출', color: '#8B5CF6', icon: '💰' },
  index:        { key: 'index',        label: '지표', color: '#06B6D4', icon: '📊' },
  other:        { key: 'other',        label: '기타', color: '#6B7280', icon: '📌' },
};
