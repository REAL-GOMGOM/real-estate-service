import 'server-only';
import { Redis } from '@upstash/redis';
import type { Report } from './types';

/**
 * Vercel KV 브랜드 DB (naezip-kv)에서 최신 리포트 조회
 *
 * 주의: 프로젝트에 Upstash DB 2개 존재 (리포트용·방문자용).
 * `Redis.fromEnv()`는 UPSTASH_REDIS_REST_* 우선 → 방문자 DB 연결 →
 * 리포트 데이터 못 찾음. 따라서 KV_* 환경변수 명시적 사용.
 */
export async function getLatestReport(): Promise<Report | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    console.error('[getLatestReport] KV_REST_API_URL 또는 KV_REST_API_TOKEN 미설정');
    return null;
  }

  try {
    const redis = new Redis({ url, token });
    const report = await redis.get<Report>('report:latest');
    return report ?? null;
  } catch (e) {
    console.error('[getLatestReport] Redis 조회 실패:', e);
    return null;
  }
}
