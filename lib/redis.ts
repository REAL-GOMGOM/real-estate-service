import { Redis } from '@upstash/redis';

/**
 * 방문자 트래킹 등 범용 Upstash Redis 클라이언트.
 *
 * Redis.fromEnv() 환경변수 우선순위:
 *   1. UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
 *   2. (폴백) KV_REST_API_URL / KV_REST_API_TOKEN
 *
 * 현 프로젝트는 두 세트 모두 등록되어 있어 1순위(UPSTASH_*)가 잡힘 →
 * 방문자 DB(curious-geld...)에 연결됨.
 *
 * ⚠️ 리포트 관련 코드는 절대 이 인스턴스를 쓰지 말 것.
 *    리포트는 lib/report/redis.ts의 getReportRedis() 사용 필수.
 *    (DB 미스매치로 회귀 발생한 이력 있음 — 커밋 d1a9439)
 */
export const redis = Redis.fromEnv();
