import type { TickerItem } from '@/components/landing/LiveTicker';
import type { District } from '@/components/landing/TodayReport';
import type { TopLocation } from '@/components/landing/TopLocations';
import type { DealItem } from '@/components/landing/DealFeed';

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

// 사이클 U 1a 메인 실거래 피드 목업 — 실데이터(/api/transactions) 연동 전 프레젠테이션용
export const MOCK_DEALS: DealItem[] = [
  {
    apt: '압구정 현대', gu: '강남구', dong: '압구정동', ago: '방금',
    price: '34.5억', delta: '1.4억', up: true, high: true,
    size: '84m²', floor: '11층', contract: '2026.06.28 계약',
    prev: '33.1억', prevDate: '2026.03', source: '국토부',
    spark: '0,44 14,40 28,42 42,34 56,30 70,32 84,22 100,14',
  },
  {
    apt: '래미안 퍼스티지', gu: '서초구', dong: '반포동', ago: '1분 전',
    price: '41.2억', delta: '0.7억', up: true,
    size: '84m²', floor: '18층', contract: '2026.06.30 계약',
    prev: '40.5억', prevDate: '2026.04', source: '국토부',
    spark: '0,40 16,36 32,38 48,28 64,30 80,20 100,12',
  },
  {
    apt: '잠실 리센츠', gu: '송파구', dong: '잠실동', ago: '2분 전',
    price: '27.8억', delta: '0.1억', up: false,
    size: '84m²', floor: '7층', contract: '2026.06.29 계약',
    prev: '27.9억', prevDate: '2026.05', source: '부동산원',
    spark: '0,18 14,24 28,20 42,30 56,26 70,36 84,32 100,42',
  },
  {
    apt: '나인원한남', gu: '용산구', dong: '한남동', ago: '3분 전',
    price: '68.0억', delta: '2.1억', up: true, high: true,
    size: '124m²', floor: '9층', contract: '2026.06.27 계약',
    prev: '65.9억', prevDate: '2026.02', source: '국토부',
    spark: '0,46 20,38 40,40 60,26 80,18 100,10',
  },
  {
    apt: '마포래미안 푸르지오', gu: '마포구', dong: '아현동', ago: '5분 전',
    price: '14.9억', delta: '0.2억', up: false,
    size: '59m²', floor: '12층', contract: '2026.06.30 계약',
    prev: '15.1억', prevDate: '2026.05', source: '부동산원',
    spark: '0,22 20,28 40,24 60,34 80,30 100,40',
  },
];
