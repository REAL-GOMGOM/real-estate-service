export type Sido = '서울' | '경기' | '인천';

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
}

export interface Deal {
  aptNm: string;
  umdNm: string;
  excluUseAr: number;
  dealAmount: number; // 원 단위
  dealYear: string;
  dealMonth: string;
  dealDay: string;
  lawdCd: string;
  districtName: string;
  sido: Sido;
}

export type YearHigh = {
  apartment: string;
  region: string;
  sido: Sido;
  sigungu: string;
  area: number;
  newPrice: number;
  prevHigh: number;
  increase: number;
  date: string;
};

export type RegionStats = {
  sido: Sido;
  deals: number;
  yearHighs: number;
  avgPrice: number;
  totalAmount: number;
};

export type Report = {
  generatedAt: string;
  title: string;
  subtitle: string;
  dateRange: DateRange;
  range: 'sudogwon';
  summary: {
    totalDeals: number;
    totalYearHighs: number;
    totalAmount: number;
    avgPrice: number;
  };
  byRegion: RegionStats[];
  topYearHighs: YearHigh[];
  disclaimer: string;
};
