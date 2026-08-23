/** 상승률 대시보드 관련 타입 */

export type TrendPeriod = 'six_months' | 'one_year' | 'eighteen_months' | 'two_years';

export interface PriceTrendData {
  status: 'ok' | 'partial';
  period: TrendPeriod;
  frequency: 'monthly';
  metric: 'change_from_first_month_pct';
  source: '한국부동산원 R-ONE';
  coverage: {
    requestedMonths: number;
    returnedMonths: number;
    unavailableMonths: number;
    firstMonth: string;
    lastMonth: string;
  };
  data: Array<{
    date: string;
    regions: Record<string, number>;
  }>;
}

export const PERIOD_OPTIONS: { label: string; value: TrendPeriod }[] = [
  { label: '6개월', value: 'six_months' },
  { label: '1년', value: 'one_year' },
  { label: '1년 6개월', value: 'eighteen_months' },
  { label: '2년', value: 'two_years' },
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
