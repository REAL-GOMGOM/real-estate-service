/** 매매/전세 변동률 지도 관련 타입 */

export interface PriceChangeData {
  period: string;
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
export type PeriodType = 'weekly' | 'monthly';
