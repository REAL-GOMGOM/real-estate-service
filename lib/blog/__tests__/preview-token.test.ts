import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPreviewToken,
  verifyPreviewToken,
  PREVIEW_TOKEN_TTL_SECONDS,
} from '../preview-token';

/**
 * 미리보기 토큰 유틸 단위 테스트.
 */

const SECRET = 'preview-secret-key';
const POST_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.stubEnv('PREVIEW_TOKEN_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('createPreviewToken / verifyPreviewToken', () => {
  it('정상 생성 → 검증 통과 + postId 반환', () => {
    const token = createPreviewToken(POST_ID);
    expect(token).toContain('.');
    expect(verifyPreviewToken(token)).toEqual({ ok: true, postId: POST_ID });
  });

  it('기본 TTL 상수 = 7일', () => {
    expect(PREVIEW_TOKEN_TTL_SECONDS).toBe(604_800);
  });

  it('위조 서명 거부 → invalid', () => {
    const token = createPreviewToken(POST_ID);
    const [payload] = token.split('.');
    const forged = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(verifyPreviewToken(forged)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('payload 변조(다른 postId 주입) 거부 → invalid (서명 불일치)', () => {
    const token = createPreviewToken(POST_ID);
    const sig = token.split('.')[1];
    // 다른 postId 로 payload 위조하되 기존 서명 재사용 → 불일치
    const forgedPayload = Buffer.from(
      JSON.stringify({ postId: 'aaaaaaaa-1111-1111-1111-111111111111', exp: 9e9 }),
      'utf8',
    )
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(verifyPreviewToken(`${forgedPayload}.${sig}`)).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('만료 토큰 거부 → expired', () => {
    const token = createPreviewToken(POST_ID, -10); // 이미 만료
    expect(verifyPreviewToken(token)).toEqual({ ok: false, reason: 'expired' });
  });

  it('형식 오류(점 없음) 거부 → invalid', () => {
    expect(verifyPreviewToken('not-a-token')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('빈 문자열 거부 → invalid', () => {
    expect(verifyPreviewToken('')).toEqual({ ok: false, reason: 'invalid' });
  });

  it('다른 시크릿으로 만든 토큰 거부 (위조 불가)', () => {
    const token = createPreviewToken(POST_ID);
    vi.stubEnv('PREVIEW_TOKEN_SECRET', 'different-secret');
    expect(verifyPreviewToken(token)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('시크릿 미설정 시 create throw (fail-closed)', () => {
    vi.stubEnv('PREVIEW_TOKEN_SECRET', '');
    expect(() => createPreviewToken(POST_ID)).toThrow();
  });

  it('시크릿 미설정 시 verify invalid (fail-closed)', () => {
    const token = createPreviewToken(POST_ID);
    vi.stubEnv('PREVIEW_TOKEN_SECRET', '');
    expect(verifyPreviewToken(token)).toEqual({ ok: false, reason: 'invalid' });
  });
});
