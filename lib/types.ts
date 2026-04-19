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
  // 기본 식별
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  region: string;
  level: 'city' | 'district';
  cityId?: string;
  month: string;

  // 점수
  score: number;                          // Eric 재산정점수 (1.0~5.0)
  trend: 'up' | 'down' | 'flat';
  prevScore: number;                      // 원본 AI 점수 (비교용)

  // v2 — 정량 메트릭
  metrics: {
    pricePerPyeong: number | null;        // 평당가 (만원)
    annualChange2025: number | null;      // 2025 누계 매매 변동률 (%)
    weeklyChange2026: number | null;      // 2026.4 주간 매매 변동률 (%)
    transport: number;                    // 교통 0~10
    school: number;                       // 학군 0~10
    industry: number;                     // 산업 0~10
    supply: number;                       // 공급 0~10
    jeonseRatio: number | null;           // 전세가율 %
    populationFlow: number;               // 월 인구순이동
    tradeVolumeChange: number;            // 거래량 YoY %
    unsold: number;                       // 미분양 호수
    confidence: 'H' | 'M' | 'L';         // 데이터 신뢰도
  };

  // v2 — 시나리오 민감도
  scenarios: {
    base: number;
    price: number;
    growth: number;
    infra: number;
    sensitivity: number;
  };

  // 규제
  isToheo: boolean;
  toheoUntil?: string;

  // 특수 메모
  specialNote?: string;

  // 메타
  source: 'eric_v2';
  lastUpdated: string;
}

export interface LocationInsight {
  id: string;
  headline: string;
  summary: string;
  tags: string[];
  generatedAt: string;
  scoreAtGeneration: number;
}

export interface RegionDetail extends LocationScore {
  insight: LocationInsight;
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