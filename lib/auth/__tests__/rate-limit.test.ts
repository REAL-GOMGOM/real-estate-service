/**
 * rate-limit 특성테스트 (Y5) — IP 추출 순수 함수 + limiter 팩토리 동작 고정.
 *
 * 실제 카운팅은 Upstash 서버 사이드라 여기서 검증하지 않는다.
 * 고정 대상: env 가드(throw), 싱글톤 캐싱, 클라이언트 식별자 추출 규칙.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('getClientIdentifier', () => {
  it('x-forwarded-for 첫 값(트림)을 사용', async () => {
    const { getClientIdentifier } = await import('../rate-limit');
    const h = new Headers({ 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' });
    expect(getClientIdentifier(h)).toBe('1.2.3.4');
  });

  it('x-forwarded-for 없으면 x-real-ip 폴백', async () => {
    const { getClientIdentifier } = await import('../rate-limit');
    const h = new Headers({ 'x-real-ip': '9.9.9.9' });
    expect(getClientIdentifier(h)).toBe('9.9.9.9');
  });

  it('둘 다 없으면 unknown', async () => {
    const { getClientIdentifier } = await import('../rate-limit');
    expect(getClientIdentifier(new Headers())).toBe('unknown');
  });

  it('x-forwarded-for가 쉼표뿐(빈 첫 값)이면 x-real-ip 폴백', async () => {
    const { getClientIdentifier } = await import('../rate-limit');
    const h = new Headers({ 'x-forwarded-for': ' , 5.6.7.8', 'x-real-ip': '9.9.9.9' });
    expect(getClientIdentifier(h)).toBe('9.9.9.9');
  });
});

describe('limiter 팩토리 — env 가드', () => {
  it('UPSTASH env 미설정 시 로그인 limiter throw (호출부 fail-open 전제)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const { getLoginRatelimit } = await import('../rate-limit');
    expect(() => getLoginRatelimit()).toThrow('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN 미설정');
  });

  it('UPSTASH env 미설정 시 업로드 limiter도 동일 throw', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const { getUploadRatelimit } = await import('../rate-limit');
    expect(() => getUploadRatelimit()).toThrow('[ratelimit] UPSTASH_REDIS_REST_URL/TOKEN 미설정');
  });
});

describe('limiter 팩토리 — 생성·싱글톤', () => {
  it('env 설정 시 인스턴스 생성, 재호출은 동일 인스턴스(캐싱)', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://dummy.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'dummy-token');
    const { getLoginRatelimit, getUploadRatelimit } = await import('../rate-limit');

    const login1 = getLoginRatelimit();
    const login2 = getLoginRatelimit();
    expect(login1).toBe(login2); // 싱글톤

    const upload = getUploadRatelimit();
    expect(upload).not.toBe(login1); // 로그인·업로드 limiter는 별개 인스턴스
  });
});
