// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DISTRICT_CODE } from '@/lib/district-codes';
import {
  DEFAULT_HOME_DISTRICT, HOME_DISTRICT_GROUPS, HOME_DISTRICT_STORAGE_KEY,
  getHomeDistrictSnapshot, homeDistrictLabel, saveHomeDistrict, subscribeHomeDistrict,
} from '../home-district';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('home district preference', () => {
  it('조회 가능한 모든 시군구를 중복 없이 포함한다', () => {
    const districts = HOME_DISTRICT_GROUPS.flatMap((group) => group.districts);
    expect(districts.length).toBe(new Set(districts).size);
    expect([...districts].sort()).toEqual(Object.keys(DISTRICT_CODE).sort());
    expect(districts).toContain('홍천군');
    expect(districts).toContain('강원 고성군');
    expect(districts).toContain('경남 고성군');
    expect(homeDistrictLabel('광주시')).toBe('경기 광주시');
    expect(homeDistrictLabel('부산 해운대구')).toBe('부산 해운대구');
  });

  it('선택한 정식 지역명 하나만 저장하고 같은 탭 구독자에게 알린다', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHomeDistrict(listener);
    expect(saveHomeDistrict('부산 해운대구')).toBe(true);
    expect(window.localStorage.getItem(HOME_DISTRICT_STORAGE_KEY)).toBe('부산 해운대구');
    expect(window.localStorage.length).toBe(1);
    expect(getHomeDistrictSnapshot()).toBe('부산 해운대구');
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    saveHomeDistrict('과천시');
    expect(listener).toHaveBeenCalledOnce();
  });

  it.each(['', '없는 구', '__proto__', 'toString', '{"district":"강남구"}', '강남구?months=36'])('잘못된 저장값은 기본 지역으로 안전하게 처리한다 (%s)', (value) => {
    window.localStorage.setItem(HOME_DISTRICT_STORAGE_KEY, value);
    expect(getHomeDistrictSnapshot()).toBe(DEFAULT_HOME_DISTRICT);
    expect(saveHomeDistrict(value)).toBe(false);
  });

  it('다른 저장소 변화는 무시하고 관심지역 변경·전체 삭제만 반영한다', () => {
    const listener = vi.fn(); const unsubscribe = subscribeHomeDistrict(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
    expect(listener).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: HOME_DISTRICT_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('읽기·쓰기 저장소 차단으로 조회 흐름을 중단하지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(getHomeDistrictSnapshot()).toBe(DEFAULT_HOME_DISTRICT);
    expect(saveHomeDistrict('과천시')).toBe(false);
  });

  it('쓰기 후 읽기가 차단되어도 저장 성공을 단정하지 않는다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(saveHomeDistrict('과천시')).toBe(false);
  });
});
