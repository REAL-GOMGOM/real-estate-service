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
  complexA: { district: string; name: string; dong?: string; size?: number };
  complexB?: { district: string; name: string; dong?: string; size?: number };
  askingPrice?: number;
  period?: number; // 개월
}

export interface MonthlyPrice {
  date: string; // "2025-01"
  avgPrice: number; // 만원
  count: number;
}

export interface GapResult {
  status: 'ok' | 'partial';
  complexA: { name: string; district: string; dong?: string; size?: number; prices: MonthlyPrice[] };
  complexB?: { name: string; district: string; dong?: string; size?: number; prices: MonthlyPrice[] };
  monthlyGap: Array<{ date: string; gap: number }>;
  historicalAvgGap: number;
  currentGap: number;
  margin: number; // 현재갭 - 역사평균갭
  signal: 'above_baseline' | 'below_baseline' | 'near_baseline' | 'insufficient';
  zScore: number | null;
  dataWarning?: string;
  // 갭투자 분석 추가
  rentAvg?: number | null;       // 평균 전세가 (만원)
  rentRatio?: number | null;     // 전세가율 (%)
  investmentGap?: number | null; // 투자금(갭) = 매매가 - 전세가 (만원)
  latestPrice?: number | null;   // 최근 매매 평균가 (만원)
  tradeCount?: number;
  rentCount?: number;
  coverage: {
    requestedMonths: string[];
    saleA: { requestedMonths: string[]; successfulMonths: string[]; failedMonths: string[] };
    rentA: { requestedMonths: string[]; successfulMonths: string[]; failedMonths: string[] };
    saleB?: { requestedMonths: string[]; successfulMonths: string[]; failedMonths: string[] };
  };
  method: string;
}
