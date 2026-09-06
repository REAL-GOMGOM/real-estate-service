import { describe, expect, it } from 'vitest';
import { DISTRICT_CODE } from '../district-codes';
import { DISTRICT_GROUPS, SUPPORTED_DISTRICT_GROUPS, getSupportedRegionIndex } from '../district-groups';

describe('supported district groups', () => {
  it('keeps all 16 group labels and exactly the 248 canonical query targets without duplicates', () => {
    expect(SUPPORTED_DISTRICT_GROUPS.map((group) => group.label))
      .toEqual(DISTRICT_GROUPS.map((group) => group.label));
    expect(SUPPORTED_DISTRICT_GROUPS).toHaveLength(16);
    const districts = SUPPORTED_DISTRICT_GROUPS.flatMap((group) => group.districts);
    expect(districts).toHaveLength(248);
    expect(new Set(districts).size).toBe(districts.length);
    expect([...districts].sort()).toEqual(Object.keys(DISTRICT_CODE).sort());
  });

  it.each([
    ['홍천군', '강원'], ['강원 고성군', '강원'], ['경남 고성군', '경남'],
    ['태안군', '충남'], ['부안군', '전북'], ['신안군', '광주·전남'],
    ['광주시', '경기'], ['광주 동구', '광주·전남'], ['부산 해운대구', '부산'],
  ])('resolves %s to %s, not a default Seoul group', (district, label) => {
    const index = getSupportedRegionIndex(district);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(SUPPORTED_DISTRICT_GROUPS[index].label).toBe(label);
  });

  it('does not mutate the curated groups or accept unknown district names', () => {
    expect(DISTRICT_GROUPS.find((group) => group.label === '강원')?.districts).not.toContain('홍천군');
    expect(getSupportedRegionIndex('없는 군')).toBe(-1);
    expect(getSupportedRegionIndex('__proto__')).toBe(-1);
  });
});
