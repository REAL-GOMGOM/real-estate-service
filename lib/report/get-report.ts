import 'server-only';
import { Redis } from '@upstash/redis';
import type { Report } from './types';

export async function getLatestReport(): Promise<Report | null> {
  try {
    const redis = Redis.fromEnv();
    const report = await redis.get<Report>('report:latest');
    return report ?? null;
  } catch (e) {
    console.error('[getLatestReport] Redis 조회 실패:', e);
    return null;
  }
}
