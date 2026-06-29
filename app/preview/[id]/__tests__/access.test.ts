import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { evaluatePreviewAccess } from '../access';
import { createPreviewToken } from '@/lib/blog/preview-token';

/**
 * 공개 미리보기 보안 게이트(evaluatePreviewAccess) 단위 테스트.
 */

const SECRET = 'preview-secret';
const POST_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  vi.stubEnv('PREVIEW_TOKEN_SECRET', SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('evaluatePreviewAccess', () => {
  it('유효 토큰 + 일치 id → ok', () => {
    const token = createPreviewToken(POST_ID);
    expect(evaluatePreviewAccess(POST_ID, token)).toEqual({ ok: true });
  });

  it('토큰 없음 → missing', () => {
    expect(evaluatePreviewAccess(POST_ID, undefined)).toEqual({
      ok: false,
      reason: 'missing',
    });
  });

  it('위조 토큰 → invalid', () => {
    expect(evaluatePreviewAccess(POST_ID, 'forged.token')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('만료 토큰 → expired', () => {
    const token = createPreviewToken(POST_ID, -10);
    expect(evaluatePreviewAccess(POST_ID, token)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('id 불일치(다른 글 토큰) → mismatch', () => {
    const token = createPreviewToken(OTHER_ID);
    expect(evaluatePreviewAccess(POST_ID, token)).toEqual({
      ok: false,
      reason: 'mismatch',
    });
  });
});
