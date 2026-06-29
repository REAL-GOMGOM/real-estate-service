import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyMachineToken } from '../machine-auth';

/**
 * 머신 토큰 인증 헬퍼 단위 테스트.
 */

function reqWithAuth(value?: string): Request {
  const headers = new Headers();
  if (value !== undefined) headers.set('authorization', value);
  return new Request('https://example.com/api/machine/posts', { headers });
}

const SECRET = 'super-secret-token-value';

beforeEach(() => {
  vi.stubEnv('MACHINE_PUBLISH_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('verifyMachineToken', () => {
  it('정상 Bearer 토큰 → ok', () => {
    const result = verifyMachineToken(reqWithAuth(`Bearer ${SECRET}`));
    expect(result).toEqual({ ok: true });
  });

  it('토큰 불일치 → 401', () => {
    const result = verifyMachineToken(reqWithAuth('Bearer wrong-token'));
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('Authorization 헤더 없음 → 401', () => {
    const result = verifyMachineToken(reqWithAuth(undefined));
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('Bearer prefix 없음 → 401', () => {
    const result = verifyMachineToken(reqWithAuth(SECRET));
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('길이가 다른 토큰도 throw 없이 401', () => {
    const result = verifyMachineToken(reqWithAuth('Bearer x'));
    expect(result).toEqual({ ok: false, status: 401, error: 'Unauthorized' });
  });

  it('시크릿 미설정 → 500 fail-closed', () => {
    vi.stubEnv('MACHINE_PUBLISH_SECRET', '');
    const result = verifyMachineToken(reqWithAuth(`Bearer ${SECRET}`));
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Server misconfigured: MACHINE_PUBLISH_SECRET missing',
    });
  });
});
