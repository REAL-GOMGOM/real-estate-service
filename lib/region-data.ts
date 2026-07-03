/**
 * 지역 상세 페이지 데이터 어댑터 — Phase 5c-7 Stage 1
 *
 * 빌드 시점에 JSON 2개를 읽어 결합 (SSG이므로 런타임 부담 0).
 */

import scoresData from '@/data/location-scores.json';
import insightsData from '@/data/location-insights.json';
import type {
  LocationScore,
  LocationInsight,
  RegionDetail,
} from './types';

const scores = scoresData as LocationScore[];
const insights = insightsData as LocationInsight[];

const scoreById = new Map(scores.map((s) => [s.id, s]));
const insightById = new Map(insights.map((i) => [i.id, i]));

/** 전체 지역 id 배열 — generateStaticParams용 */
export async function getAllRegionIds(): Promise<string[]> {
  return scores.map((s) => s.id);
}

/**
 * 입지 점수 상위 지역 (점수 낮을수록 우수) — 랜딩 LOCATION SCORE TOP N.
 * 사이클 U: mock 제거, location-scores.json에서 직접 도출 (데이터 갱신 시 자동 반영).
 */
export function getTopLocations(limit = 5): Array<{
  rank: number;
  name: string;
  score: number;
  id: string;
}> {
  return [...scores]
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s, i) => ({ rank: i + 1, name: s.name, score: s.score, id: s.id }));
}

/** id로 단일 지역 상세 조회 */
export async function getRegionById(
  id: string,
): Promise<RegionDetail | null> {
  const score = scoreById.get(id);
  if (!score) return null;

  const insight = insightById.get(id);
  const fallbackInsight: LocationInsight = {
    id,
    headline: score.name,
    summary: '',
    tags: [],
    generatedAt: '',
    scoreAtGeneration: score.score,
  };

  return { ...score, insight: insight ?? fallbackInsight };
}

/** 같은 region 내 점수 근접 지역 N개 */
export async function getNearbyRegions(
  region: RegionDetail,
  limit = 5,
): Promise<RegionDetail[]> {
  const siblings = scores
    .filter((s) => s.region === region.region && s.id !== region.id)
    .sort(
      (a, b) =>
        Math.abs(a.score - region.score) - Math.abs(b.score - region.score),
    )
    .slice(0, limit);

  const details = await Promise.all(siblings.map((s) => getRegionById(s.id)));
  return details.filter((r): r is RegionDetail => r !== null);
}

/** 특정 region 전체 지역 */
export async function getRegionsByRegionName(
  regionName: string,
): Promise<RegionDetail[]> {
  const matching = scores.filter((s) => s.region === regionName);
  const details = await Promise.all(matching.map((s) => getRegionById(s.id)));
  return details.filter((r): r is RegionDetail => r !== null);
}
