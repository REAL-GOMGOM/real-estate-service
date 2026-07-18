/**
 * matchesQuery 단위 테스트 — 검색개선(오매칭 완화).
 *
 * 3순위 "앞 2글자 + 브랜드" 룰 제거로 브랜드만 겹치는 오매칭을 막고,
 * 의도된 매칭(부분문자열·별칭·브랜드 토큰 2개)과 공백 무시는 보존한다.
 */
import { describe, it, expect } from 'vitest';
import { matchesQuery } from '../search-utils';

describe('matchesQuery', () => {
  it('정확 부분문자열·별칭은 매칭', () => {
    expect(matchesQuery('래미안대치팰리스', '래미안대치팰리스')).toBe(true);
    expect(matchesQuery('송파헬리오시티', '헬리오시티')).toBe(true);
  });

  it('브랜드 토큰 2개는 매칭 (금호센트럴자이 → 금호자이1차)', () => {
    expect(matchesQuery('금호자이1차', '금호센트럴자이')).toBe(true);
  });

  it('오매칭 방지 — 브랜드만 겹치는 다른 단지는 매칭 안 함', () => {
    // '철산자이더헤리티지'로 검색 시 '철산래미안자이'가 잡히면 안 됨 (기존 버그)
    expect(matchesQuery('철산래미안자이', '철산자이더헤리티지')).toBe(false);
    expect(matchesQuery('철산센트럴푸르지오', '철산자이더헤리티지')).toBe(false);
  });

  it('공백은 무시하고 매칭', () => {
    expect(matchesQuery('철산자이더헤리티지', '철산자이 더 헤리티지')).toBe(true);
  });

  it('무관한 단지는 매칭 안 함', () => {
    expect(matchesQuery('파크리오', '헬리오시티')).toBe(false);
  });
});
