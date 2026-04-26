import 'server-only';
import { getReportRedis } from './redis';
import type { Report } from './types';

/**
 * Vercel KV 브랜드 DB(naezip-kv)에서 최신 리포트 조회
 *
 * 연결은 getReportRedis() 헬퍼를 통해서만 — DB 미스매치 방지.
 */
export async function getLatestReport(): Promise<Report | null> {
  try {
    const redis = getReportRedis();
    const report = await redis.get<Report>('report:latest');
    return report ?? null;
  } catch (e) {
    console.error('[getLatestReport] Redis 조회 실패:', e);
    return null;
  }
}
