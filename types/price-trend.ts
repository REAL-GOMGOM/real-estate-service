/** 상승률 대시보드 관련 타입 */

export type TrendPeriod = 'daily' | 'weekly' | 'quarterly' | 'half_yearly' | 'yearly';

export interface PriceTrendData {
  period: TrendPeriod;
  data: Array<{
    date: string;
    regions: Record<string, number>;
  }>;
}

export const PERIOD_OPTIONS: { label: string; value: TrendPeriod }[] = [
  { label: '일간', value: 'daily' },
  { label: '주간', value: 'weekly' },
  { label: '분기', value: 'quarterly' },
  { label: '반기', value: 'half_yearly' },
  { label: '연간', value: 'yearly' },
];

export const REGION_COLORS: Record<string, string> = {
  '서울': '#EF4444',
  '경기': '#3B82F6',
  '인천': '#22C55E',
  '부산': '#F97316',
  '대구': '#8B5CF6',
  '대전': '#06B6D4',
  '광주': '#F59E0B',
  '울산': '#EC4899',
  '세종': '#14B8A6',
  '강원': '#6366F1',
  '충북': '#84CC16',
  '충남': '#A855F7',
  '전북': '#FB923C',
  '전남': '#2DD4BF',
  '경북': '#F472B6',
  '경남': '#818CF8',
  '제주': '#FBBF24',
};
