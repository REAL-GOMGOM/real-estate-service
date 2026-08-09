/** 매매/전세 변동률 지도 관련 타입 */

export interface PriceChangeData {
  period: string;
  /** 한국부동산원 월간 지수 비교. 주간 데이터로 해석하면 안 된다. */
  frequency: 'monthly';
  type: 'sale' | 'rent';
  summary: {
    nationwide: number;
    capital_area: number;
    non_capital: number;
  };
  regions: RegionChange[];
}

export interface RegionChange {
  code: string;
  name: string;
  change_rate: number;
  direction: 'up' | 'down' | 'flat';
}

export type TradeType = 'sale' | 'rent';
export type PeriodType = 'monthly';
