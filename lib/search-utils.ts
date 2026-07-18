/**
 * 단지명 fuzzy matching 유틸리티
 *
 * 테스트 케이스:
 * - "금호센트럴자이" → "금호자이1차" ✅ (alias + prefix+brand)
 * - "래미안대치팰리스" → "래미안대치팰리스" ✅ (exact substring)
 * - "잠실엘스" → "잠실주공5단지" ✅ (alias)
 * - "헬리오시티" → "송파헬리오시티" ✅ (alias)
 * - "금호" → "금호자이1차", "금호어울림" 등 ✅ (prefix match)
 */

import { resolveAlias } from './apt-aliases';

const APT_BRANDS = [
  '래미안', '자이', '힐스테이트', '아크로', '더샵', '푸르지오', '롯데캐슬',
  'e편한세상', '디에이치', '포레나', '오티에르', '한화포레나', '반포', '대치',
  '잠실', '압구정', '금호', '도곡', '개포', '둔촌', '위례', '마곡',
  '과천', '판교', '광교', '동탄', '하남',
] as const;

/** 검색어를 의미 있는 토큰으로 분리 */
export function tokenize(query: string): string[] {
  const normalized = query.replace(/\s+/g, '');
  const tokens: string[] = [];

  for (const brand of APT_BRANDS) {
    if (normalized.includes(brand)) {
      tokens.push(brand);
    }
  }

  const numMatch = normalized.match(/(\d+)(차|단지|블록|동)/);
  if (numMatch) tokens.push(numMatch[0]);

  if (tokens.length === 0) tokens.push(normalized);

  return [...new Set(tokens)];
}

/** 단지명이 검색 토큰과 매칭되는지 확인 */
export function matchesQuery(aptName: string, query: string): boolean {
  const normalizedName = aptName.replace(/\s+/g, '');
  const normalizedQuery = query.replace(/\s+/g, '');

  // 0순위: 별칭 매칭 (통칭 → 국토부 등록명)
  const aliases = resolveAlias(query);
  if (aliases.length > 0) {
    for (const alias of aliases) {
      if (normalizedName.includes(alias.replace(/\s+/g, ''))) return true;
    }
  }

  // 1순위: 정확한 부분문자열 매칭
  if (normalizedName.includes(normalizedQuery)) return true;
  if (normalizedQuery.includes(normalizedName)) return true;

  // 2순위: 토큰 매칭 (모든 토큰이 단지명에 포함되면 매칭)
  const tokens = tokenize(query);
  if (tokens.length >= 2) {
    return tokens.every(token => normalizedName.includes(token));
  }

  // (구 3순위 "앞 2글자 + 브랜드" 룰 제거 — '철산자이더헤리티지' 검색 시 '철산래미안자이'
  //  까지 잡히는 오매칭을 유발했다. 의도된 매칭(금호센트럴자이→금호자이1차)은 2순위
  //  브랜드 토큰 매칭이 이미 커버하고, 정확 검색은 전국 단지 자동완성 선택이 담당하므로
  //  이 느슨한 폴백은 제거한다.)
  return false;
}
