import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * 머신(비-세션) 호출용 Bearer 토큰 인증 헬퍼.
 *
 * 어드민 발행은 Auth.js 세션, 머신(텔레그램 봇) 발행은 이 토큰으로 분리한다.
 * 환경변수는 MACHINE_PUBLISH_SECRET — CRON_SECRET 과 별개(재사용 금지).
 *
 * fail-closed: 시크릿 미설정 시 호출 거부(500).
 * timing-safe: 제공 토큰과 시크릿을 각각 sha256 해 고정 길이 digest 로 비교
 *   → 비교 시간이 입력에 의존하지 않고, 토큰 길이도 노출되지 않는다.
 */

export type MachineAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: string };

function sha256(input: string): Buffer {
  return createHash('sha256').update(input, 'utf8').digest();
}

/**
 * 두 문자열을 timing-safe 하게 비교.
 * 길이가 달라도 timingSafeEqual 이 throw 하지 않도록 항상 32바이트 digest 로 비교.
 */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/**
 * Authorization: Bearer <MACHINE_PUBLISH_SECRET> 검증.
 *
 * @returns 통과 시 { ok: true }, 실패 시 status/error 포함
 */
export function verifyMachineToken(req: Request): MachineAuthResult {
  const secret = process.env.MACHINE_PUBLISH_SECRET;
  if (!secret) {
    console.error('[machine-auth] MACHINE_PUBLISH_SECRET 미설정 — fail-closed');
    return {
      ok: false,
      status: 500,
      error: 'Server misconfigured: MACHINE_PUBLISH_SECRET missing',
    };
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const token = authHeader.slice(prefix.length);
  if (!safeEqual(token, secret)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}
