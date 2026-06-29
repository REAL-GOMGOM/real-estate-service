import { verifyPreviewToken } from '@/lib/blog/preview-token';

/**
 * 공개 미리보기 접근 판정 (순수 로직, DB 비의존 — 보안 게이트).
 *
 * 토큰 없음 / 위조 / 만료 / URL의 id와 토큰 postId 불일치를 각각 구분해 거부.
 * 통과한 경우에만 호출부가 draft 글을 조회·렌더한다.
 */
export type PreviewAccess =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'invalid' | 'expired' | 'mismatch' };

export function evaluatePreviewAccess(
  id: string,
  token: string | undefined,
): PreviewAccess {
  if (!token) return { ok: false, reason: 'missing' };

  const verified = verifyPreviewToken(token);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  // 한 토큰으로 다른 글을 못 보게: URL의 [id]와 토큰 바인딩 postId 일치 강제
  if (verified.postId !== id) return { ok: false, reason: 'mismatch' };

  return { ok: true };
}
