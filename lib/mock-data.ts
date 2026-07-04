import type { District } from '@/components/landing/RightRail';

/**
 * 우측 레일 TODAY'S REPORT 표시용 목업 — 실데이터 연동 백로그.
 * (메인 실거래 피드 목업 MOCK_DEALS 는 사이클 W 실데이터화로 제거)
 */
export const MOCK_DISTRICTS: District[] = [
  { name: '강남구', price: 28.4, change: 2.1 },
  { name: '서초구', price: 24.7, change: 1.8 },
  { name: '마포구', price: 12.3, change: -0.8 },
  { name: '용산구', price: 22.1, change: 2.7 },
];
