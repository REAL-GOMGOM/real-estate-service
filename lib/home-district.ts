import { DISTRICT_CODE } from '@/lib/district-codes';
import { SUPPORTED_DISTRICT_GROUPS } from '@/lib/district-groups';

export const HOME_DISTRICT_STORAGE_KEY = 'naezip.home-district.v1';
export const HOME_DISTRICT_CHANGED_EVENT = 'naezip:home-district-changed';
export const DEFAULT_HOME_DISTRICT = '강남구';

// Home and its transaction destination use the same complete picker scope.
export const HOME_DISTRICT_GROUPS = SUPPORTED_DISTRICT_GROUPS;

export function isHomeDistrict(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(DISTRICT_CODE, value);
}

export function homeDistrictGroup(district: string): string {
  return HOME_DISTRICT_GROUPS.find((group) => group.districts.includes(district))?.label ?? '';
}

export function homeDistrictLabel(district: string): string {
  const group = homeDistrictGroup(district);
  return group && !district.startsWith(group) ? `${group} ${district}` : district;
}

/** A stable primitive snapshot; browser storage is never read during SSR. */
export function getHomeDistrictSnapshot(): string {
  if (typeof window === 'undefined') return DEFAULT_HOME_DISTRICT;
  try {
    const value = window.localStorage.getItem(HOME_DISTRICT_STORAGE_KEY);
    return isHomeDistrict(value) ? value : DEFAULT_HOME_DISTRICT;
  } catch {
    return DEFAULT_HOME_DISTRICT;
  }
}

export function subscribeHomeDistrict(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === HOME_DISTRICT_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener(HOME_DISTRICT_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(HOME_DISTRICT_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Store only an explicitly chosen canonical district, no coordinates or history. */
export function saveHomeDistrict(district: string): boolean {
  if (!isHomeDistrict(district) || typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(HOME_DISTRICT_STORAGE_KEY, district);
    if (window.localStorage.getItem(HOME_DISTRICT_STORAGE_KEY) !== district) return false;
    window.dispatchEvent(new Event(HOME_DISTRICT_CHANGED_EVENT));
    return true;
  } catch {
    return false;
  }
}
