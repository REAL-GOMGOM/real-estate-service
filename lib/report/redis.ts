import 'server-only';
import { Redis } from '@upstash/redis';

/**
 * 리포트 전용 Redis 클라이언트 (KV DB)
 *
 * 주의: 프로젝트에 Upstash DB 2개 존재 (리포트용·방문자용).
 * - 리포트 DB: KV_REST_API_URL / KV_REST_API_TOKEN
 * - 방문자 DB: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *
 * Redis.fromEnv() 사용 절대 금지 — UPSTASH_* 우선 잡혀 방문자 DB로 연결됨.
 * 리포트 관련 모든 Redis 연결은 이 함수만 사용한다.
 *
 * 회귀 이력 (커밋 d1a9439):
 *   읽기(getLatestReport)만 명시 변경, 쓰기(cron)는 fromEnv 방치
 *   → DB 미스매치 → 2026-04-13 이후 신규 리포트 저장 실패
 */

let _client: Redis | null = null;

export function getReportRedis(): Redis {
  if (_client) return _client;

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      '[ReportRedis] KV_REST_API_URL 또는 KV_REST_API_TOKEN 누락. ' +
        'Vercel 환경변수 확인 필요.',
    );
  }

  _client = new Redis({ url, token });
  return _client;
}
