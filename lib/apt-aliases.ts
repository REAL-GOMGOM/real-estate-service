/**
 * 통칭/마케팅명 → 국토부 실거래 등록명 매핑
 * 검색 시 통칭으로 입력하면 등록명으로 변환하여 매칭
 */
export const APT_ALIASES: Record<string, string[]> = {
  // 성동구
  '금호센트럴자이': ['금호자이1차'],
  '금호파크자이': ['신금호파크자이'],

  // 서초구/강남구
  '래미안퍼스티지': ['반포래미안퍼스티지'],
  '아크로리버파크': ['아크로리버파크', '반포현대'],
  '래미안원베일리': ['래미안원베일리'],
  '디에이치아너힐즈': ['개포주공8단지'],

  // 송파구
  '헬리오시티': ['송파헬리오시티', '가락시영'],
  '잠실엘스': ['잠실주공5단지'],
  '잠실리센츠': ['잠실주공5단지'],
  '잠실래미안아이파크': ['잠실주공5단지'],
  '올림픽파크포레온': ['둔촌주공'],
  '파크리오': ['잠실파크리오'],

  // 용산구
  '래미안첼리투스': ['이촌래미안첼리투스'],

  // 마포구
  '래미안마포리버웰': ['마포래미안푸르지오'],
  '마포프레스티지자이': ['마포프레스티지자이'],

  // 영등포구
  '브라이튼여의도': ['여의도시범'],

  // 강동구
  '고덕그라시움': ['고덕주공'],

  // 노원구
  '노원롯데캐슬시그니처': ['상계주공'],
};

/** 검색어에 매칭되는 등록명 찾기 */
export function resolveAlias(query: string): string[] {
  const normalized = query.replace(/\s+/g, '');

  // 정확 매칭
  for (const [alias, names] of Object.entries(APT_ALIASES)) {
    if (alias.replace(/\s+/g, '') === normalized) {
      return names;
    }
  }

  // 부분 매칭 (입력이 별칭을 포함하거나 별칭이 입력을 포함)
  for (const [alias, names] of Object.entries(APT_ALIASES)) {
    const normalizedAlias = alias.replace(/\s+/g, '');
    if (normalizedAlias.includes(normalized) || normalized.includes(normalizedAlias)) {
      return names;
    }
  }

  return [];
}
