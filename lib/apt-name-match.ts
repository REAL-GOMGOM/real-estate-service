import { normalizeMLTMName } from '@/lib/normalize-mltm-name';

/**
 * 단지명 매칭 — 사이클 DD (단지 전용 페이지).
 *
 * MOLIT 실거래의 aptNm 과 단지 마스터(등록명 + 별칭)를 대조한다.
 * /api/transactions 마스터 조인과 같은 규칙 (원문 일치 → 정제명 일치).
 * 순수 함수 — 단위 테스트 대상.
 */

export interface AptNameMaster {
  name:    string;
  aliases: string[];
}

/** 마스터의 매칭 후보 이름 집합 (등록명·별칭 + 각각의 정제명) */
export function buildNameCandidates(master: AptNameMaster): Set<string> {
  const candidates = new Set<string>();
  for (const raw of [master.name, ...(master.aliases ?? [])]) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    candidates.add(trimmed);
    candidates.add(normalizeMLTMName(trimmed));
  }
  return candidates;
}

/** MOLIT aptNm 이 이 단지의 거래인지 판정 */
export function aptNameMatches(mltmName: string, candidates: Set<string>): boolean {
  const name = mltmName.trim();
  if (!name) return false;
  return candidates.has(name) || candidates.has(normalizeMLTMName(name));
}
