import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * draft 글 공개 미리보기용 서명 토큰 (stateless, DB 저장 불필요).
 *
 * 형식: base64url(payload).base64url(signature)
 *   - payload  = JSON { postId, exp }  (exp = 만료 epoch 초)
 *   - signature = HMAC-SHA256(payloadB64, PREVIEW_TOKEN_SECRET)
 *
 * 서명 키는 PREVIEW_TOKEN_SECRET — MACHINE_PUBLISH_SECRET 과 별개(유출 격리).
 * 토큰은 특정 postId 에만 유효하고 만료시각을 포함하며, HMAC 으로 위조 불가.
 *
 * fail-closed: 시크릿 미설정 시 create 는 throw, verify 는 invalid 로 거부.
 */

/** 기본 TTL — 7일(검수 가능하되 무한하지 않게). */
export const PREVIEW_TOKEN_TTL_SECONDS = 604_800;

type PreviewPayload = { postId: string; exp: number };

export type PreviewVerifyResult =
  | { ok: true; postId: string }
  | { ok: false; reason: 'invalid' | 'expired' };

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  // base64url → base64 복원 후 디코드
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function getSecret(): string {
  const secret = process.env.PREVIEW_TOKEN_SECRET;
  if (!secret) {
    throw new Error('PREVIEW_TOKEN_SECRET missing');
  }
  return secret;
}

function sign(payloadB64: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payloadB64).digest();
}

/** 현재 epoch 초. */
function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * postId 에 바인딩된 서명 토큰 생성.
 * @throws PREVIEW_TOKEN_SECRET 미설정 시
 */
export function createPreviewToken(
  postId: string,
  ttlSeconds: number = PREVIEW_TOKEN_TTL_SECONDS,
): string {
  const secret = getSecret();
  const payload: PreviewPayload = {
    postId,
    exp: nowSeconds() + ttlSeconds,
  };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sigB64 = b64urlEncode(sign(payloadB64, secret));
  return `${payloadB64}.${sigB64}`;
}

/**
 * 토큰 검증: 서명(timing-safe) + 만료.
 * 서명 불일치/형식오류 → 'invalid', 만료 → 'expired'.
 * 예외는 전부 'invalid' 로 흡수(정보 누출 방지, fail-closed).
 */
export function verifyPreviewToken(token: string): PreviewVerifyResult {
  try {
    const secret = getSecret();

    if (typeof token !== 'string' || token.length === 0) {
      return { ok: false, reason: 'invalid' };
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { ok: false, reason: 'invalid' };
    }
    const [payloadB64, sigB64] = parts;

    // 1) 서명 검증 (timing-safe)
    const expected = sign(payloadB64, secret);
    const provided = b64urlDecode(sigB64);
    if (
      expected.length !== provided.length ||
      !timingSafeEqual(expected, provided)
    ) {
      return { ok: false, reason: 'invalid' };
    }

    // 2) payload 파싱
    const payload = JSON.parse(
      b64urlDecode(payloadB64).toString('utf8'),
    ) as Partial<PreviewPayload>;
    if (typeof payload.postId !== 'string' || typeof payload.exp !== 'number') {
      return { ok: false, reason: 'invalid' };
    }

    // 3) 만료 검증
    if (payload.exp < nowSeconds()) {
      return { ok: false, reason: 'expired' };
    }

    return { ok: true, postId: payload.postId };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}
