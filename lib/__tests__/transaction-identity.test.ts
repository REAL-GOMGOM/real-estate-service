import { describe, expect, it } from 'vitest';
import {
  findApartmentIdentity,
  matchesApartmentIdentity,
  transactionGroupKey,
  type ApartmentIdentity,
} from '@/lib/transaction-identity';

const masters: ApartmentIdentity[] = [
  { id: 'a', name: '현대', aliases: ['현대아파트'], dong: '압구정동' },
  { id: 'b', name: '현대', aliases: [], dong: '대치동' },
];

describe('transaction identity', () => {
  it('같은 이름이라도 법정동이 다르면 별도 그룹 키를 만든다', () => {
    expect(transactionGroupKey('현대', '압구정동')).not.toBe(
      transactionGroupKey('현대', '대치동'),
    );
  });

  it('마스터 ID가 있으면 이름보다 정확한 ID를 우선한다', () => {
    expect(matchesApartmentIdentity(
      { aptName: '다른 이름', dong: '다른동', masterId: 'a' },
      masters[0],
    )).toBe(true);
    expect(matchesApartmentIdentity(
      { aptName: '현대', dong: '압구정동', masterId: 'b' },
      masters[0],
    )).toBe(false);
  });

  it('마스터 ID와 법정동이 모두 없으면 이름만으로 정확 선택을 추정하지 않는다', () => {
    expect(matchesApartmentIdentity(
      { aptName: '현대', dong: '압구정동' },
      { id: 'unknown-dong', name: '현대', dong: null },
    )).toBe(false);
  });

  it('별칭과 법정동이 모두 맞는 단지만 연결한다', () => {
    expect(findApartmentIdentity(
      { aptName: '현대아파트', dong: '압구정동' },
      masters,
    )?.id).toBe('a');
    expect(findApartmentIdentity(
      { aptName: '현대', dong: '대치동' },
      masters,
    )?.id).toBe('b');
  });

  it('동 정보가 없고 동명 후보가 여러 개면 임의 연결하지 않는다', () => {
    expect(findApartmentIdentity({ aptName: '현대', dong: '' }, masters)).toBeNull();
  });

  it('이름 후보가 하나여도 법정동이 다르면 연결하지 않는다', () => {
    expect(findApartmentIdentity(
      { aptName: '현대', dong: '대치동' },
      [masters[0]],
    )).toBeNull();
  });
});
