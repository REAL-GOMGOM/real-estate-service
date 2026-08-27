import { DISTRICT_CODE } from '@/lib/district-codes';
import type { LocationScore } from '@/lib/types';

type RegionTransactionTarget = Pick<
  LocationScore,
  'id' | 'name' | 'region' | 'district'
>;

const SUPPORTED_DISTRICTS = new Set(Object.keys(DISTRICT_CODE));

const REGION_DISTRICT_OVERRIDES: Readonly<Record<string, string>> = {
  'songdo-city': '인천 연수구',
  'jungdong-1st': '부천시 원미구',
  'dongtan-2nd': '화성시 동탄구',
  'changreung-3rd': '고양시 덕양구',
  'daejang-3rd': '부천시 오정구',
  'jangsang-3rd': '안산시 상록구',
};

const METROPOLITAN_PREFIXES: Readonly<Record<string, string>> = {
  인천: '인천',
  부산: '부산',
  대구: '대구',
  울산: '울산',
  대전: '대전',
  광주: '광주',
};

function parentCityCandidate(region: RegionTransactionTarget): string | null {
  if (region.name.startsWith('전주')) return `전주시 ${region.district}`;
  if (region.name.startsWith('창원')) return `창원시 ${region.district}`;
  if (region.name.startsWith('청주')) return `청주시 ${region.district}`;
  return null;
}

/** 지역 입지 데이터의 명칭을 실거래 API가 받는 단일 시군구 명칭으로 변환합니다. */
export function resolveRegionTransactionDistrict(
  region: RegionTransactionTarget,
): string | null {
  const override = REGION_DISTRICT_OVERRIDES[region.id];
  const metroPrefix = METROPOLITAN_PREFIXES[region.region];
  const candidates = [
    override,
    metroPrefix ? `${metroPrefix} ${region.district}` : null,
    parentCityCandidate(region),
    region.district,
  ];

  return candidates.find(
    (candidate): candidate is string =>
      candidate !== null && candidate !== undefined && SUPPORTED_DISTRICTS.has(candidate),
  ) ?? null;
}

/** 단일 시군구가 명확하지 않은 광역 집계는 잘못된 필터 없이 지역 선택 화면으로 보냅니다. */
export function buildRegionTransactionsHref(
  region: RegionTransactionTarget,
): string {
  const district = resolveRegionTransactionDistrict(region);
  return district
    ? `/transactions?district=${encodeURIComponent(district)}`
    : '/transactions';
}
