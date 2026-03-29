/** 갭 분석 관련 타입 */

export interface ComplexSearchResult {
  id: string;
  name: string;
  district: string;
  dong: string;
  sizes: number[];
}

export interface GapAnalysisRequest {
  mode: 'complex_vs_complex' | 'sale_vs_rent' | 'real_vs_asking';
  complexA: { district: string; name: string; size?: number };
  complexB?: { district: string; name: string; size?: number };
  askingPrice?: number;
  period?: number; // 개월
}

export interface MonthlyPrice {
  date: string; // "2025-01"
  avgPrice: number; // 만원
  count: number;
}

export interface GapResult {
  complexA: { name: string; district: string; prices: MonthlyPrice[] };
  complexB?: { name: string; district: string; prices: MonthlyPrice[] };
  monthlyGap: Array<{ date: string; gap: number }>;
  historicalAvgGap: number;
  currentGap: number;
  margin: number; // 현재갭 - 역사평균갭
  signal: 'undervalued' | 'overvalued' | 'normal';
  zScore: number;
  dataWarning?: string;
}
