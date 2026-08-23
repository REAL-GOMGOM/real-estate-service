import locationScores from '@/data/location-scores.json';
import type { LocationScore } from '@/lib/types';

/**
 * 2026-07-01 인천 행정구역 개편 뒤 경계가 달라져 기존 점수를 그대로 승계할 수 없는 항목.
 * 서해·검단·제물포·영종구 기준으로 재산정하기 전까지 공개 화면에서 제외한다.
 */
export const WITHHELD_LOCATION_SCORE_IDS = new Set([
  'incheon-seo',
  'incheon-dong',
  'incheon-jung',
]);

export const PUBLIC_LOCATION_SCORES = (locationScores as LocationScore[])
  .filter((location) => !WITHHELD_LOCATION_SCORE_IDS.has(location.id));
