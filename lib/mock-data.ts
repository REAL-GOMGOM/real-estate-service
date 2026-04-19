import type { TickerItem } from '@/components/landing/LiveTicker';
import type { District } from '@/components/landing/TodayReport';
import type { TopLocation } from '@/components/landing/TopLocations';

export const MOCK_TICKER: TickerItem[] = [
  { region: '강남구 압구정동', apt: '압구정 현대', price: '34.5억', area: '84㎡', time: '방금' },
  { region: '서초구 반포동', apt: '래미안 퍼스티지', price: '41.2억', area: '84㎡', time: '1분 전' },
  { region: '송파구 잠실동', apt: '잠실 리센츠', price: '27.8억', area: '84㎡', time: '2분 전' },
  { region: '용산구 한남동', apt: '나인원한남', price: '68.0억', area: '124㎡', time: '3분 전' },
  { region: '마포구 아현동', apt: '마포래미안 푸르지오', price: '14.9억', area: '59㎡', time: '5분 전' },
  { region: '성동구 성수동', apt: '트리마제', price: '28.3억', area: '77㎡', time: '7분 전' },
  { region: '양천구 목동', apt: '목동 신시가지', price: '22.5억', area: '89㎡', time: '9분 전' },
  { region: '영등포구 여의도동', apt: '여의도 자이', price: '18.7억', area: '84㎡', time: '12분 전' },
];

export const MOCK_DISTRICTS: District[] = [
  { name: '강남구', price: 28.4, change: 2.1 },
  { name: '서초구', price: 24.7, change: 1.8 },
  { name: '마포구', price: 12.3, change: -0.8 },
  { name: '용산구', price: 22.1, change: 2.7 },
];

export const MOCK_TOP_LOCATIONS: TopLocation[] = [
  { rank: 1, name: '강남구', score: 1.3, id: 'gangnam-gu' },
  { rank: 2, name: '서초구', score: 1.5, id: 'seocho-gu' },
  { rank: 3, name: '용산구', score: 1.6, id: 'yongsan-gu' },
  { rank: 4, name: '송파구', score: 1.7, id: 'songpa-gu' },
  { rank: 5, name: '분당구', score: 2.2, id: 'bundang-gu' },
];
