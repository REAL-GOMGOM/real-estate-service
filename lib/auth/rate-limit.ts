import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * 어드민 로그인 시도 제한.
 *
 * 정책: IP 1개당 5회/5분 슬라이딩 윈도우.
 * 실패 정책: 호출 측에서 try-catch로 fail-open 처리.
 *   (단독 어드민 lockout 위험 > brute-force 위험)
 *
 * 환경변수: UPSTASH_REDIS_REST_URL/TOKEN
 *   (방문자 추적과 같은 Upstash 인스턴스 — prefix로 키 분리)
 *
 * lazy 생성: 모듈 로드 시점이 아닌 첫 호출 시 인스턴스 생성.
 *   환경변수 미설정 빌드 시점 에러 회피.
 */

let _ratelimit: Ratelimit | null = null;

export function getLoginRatelimit(): Ratelimit {
  if (_ratelimit) return _ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN 미설정');
  }

  _ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(5, '5 m'),
    analytics: true,
    prefix: 'naezip:admin-login',
  });

  return _ratelimit;
}

/**
 * 클라이언트 IP 추출.
 * Vercel 환경: x-forwarded-for의 첫 값이 실제 클라이언트.
 */
export function getClientIdentifier(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || 'unknown';
}

// ---- 업로드 전용 rate limit (단독 싱글톤) ----

let _uploadRatelimit: Ratelimit | null = null;

/**
 * 업로드용 rate limit — admin 칼럼 작성 시 paste/drop burst 흡수
 * 정책: 분당 30회 sliding window
 * prefix: 'naezip:upload' — 로그인용 limiter와 키 공간 완전 분리
 * 미설정 시 throw — 호출부(/api/upload)에서 try/catch fail-open
 */
export function getUploadRatelimit(): Ratelimit {
  if (_uploadRatelimit) return _uploadRatelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN 미설정');
  }

  _uploadRatelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(30, '1 m'),
    analytics: true,
    prefix: 'naezip:upload',
  });

  return _uploadRatelimit;
}
