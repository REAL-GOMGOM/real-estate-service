/** 서비스 전반에서 사용하는 공통 타입 정의 */

export interface DollarApiResult {
  aptName:               string;
  district:              string;
  baseYear:              number;
  compareYear:           number;
  basePriceKrw:          number | null;
  comparePriceKrw:       number | null;
  baseExchangeRate:      number;
  compareExchangeRate:   number;
  // 연간 평균 역사적 시세 (BTC/금 변동 비교용) — Bitcoin 미존재 연도면 null
  baseBtcKrw:            number | null;
  compareBtcKrw:         number | null;
  baseGoldKrwPerGram:    number | null;
  compareGoldKrwPerGram: number | null;
}

export interface ApartmentEntry {
  id:       string;
  aptName:  string;
  district: string;
  data:     DollarApiResult | null;
  loading:  boolean;
  error:    string | null;
}

export interface LocationScore {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  score: number;
  trend: 'up' | 'down' | 'flat';
  prevScore: number;
  month: string;
  isToheo: boolean;
  toheoUntil?: string;
  region: string;
  level: 'city' | 'district';  // 시 단위 or 구 단위
  cityId?: string;              // 구가 속한 시 ID
}

export interface ChartPoint {
  date: string;
  value: number;
}

export interface MarketPrice {
  id: string;
  region: string;
  currentPrice: number;
  changeRate: number;
  chartData: ChartPoint[];
}

export interface CompetitionRateEntry {
  houseType: string;
  rate: number;
  reqCount: number | null;
}

export interface SupplyDate {
  type: 'special' | 'first' | 'second' | 'etc';
  label: string;
  date: string;
}

export interface SubscriptionItem {
  id: string;
  name: string;
  district: string;
  address: string;
  startDate: string;
  endDate: string;
  announceDate: string;
  totalUnits: number;
  competitionRate: number | null;
  competitionRates: CompetitionRateEntry[];
  status: 'upcoming' | 'ongoing' | 'closed';
  minPrice: number | null;
  maxPrice: number | null;
  houseType: string;
  supplyDates: SupplyDate[];
}

declare global {
  interface Window { kakao: KakaoMapSDK; }
}

export interface KakaoMapSDK {
  maps: {
    load: (callback: () => void) => void;
    Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
    LatLng: new (lat: number, lng: number) => KakaoLatLng;
    CustomOverlay: new (options: KakaoCustomOverlayOptions) => KakaoCustomOverlay;
    event: {
      addListener: (target: KakaoMap, type: string, handler: () => void) => void;
      removeListener: (target: KakaoMap, type: string, handler: () => void) => void;
    };
  };
}

export interface KakaoMapOptions {
  center: KakaoLatLng;
  level: number;
}

export interface KakaoMap {
  setCenter: (latlng: KakaoLatLng) => void;
  getLevel: () => number;
}

export interface KakaoLatLng {
  getLat: () => number;
  getLng: () => number;
}

export interface KakaoCustomOverlayOptions {
  position: KakaoLatLng;
  content: string | HTMLElement;
  yAnchor?: number;
  zIndex?: number;
  map?: KakaoMap | null;
}

export interface KakaoCustomOverlay {
  setMap: (map: KakaoMap | null) => void;
  getMap: () => KakaoMap | null;
}