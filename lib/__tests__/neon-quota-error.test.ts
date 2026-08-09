import { describe, expect, it } from 'vitest';

import { isNeonQuotaError } from '../neon-quota-error';

describe('isNeonQuotaError', () => {
  it('Neon 전송량 한도 메시지를 판정한다', () => {
    expect(isNeonQuotaError(new Error('Your project has exceeded the data transfer quota.'))).toBe(true);
  });

  it('HTTP 402 상태 코드와 문자열 상태 코드를 판정한다', () => {
    expect(isNeonQuotaError({ status: 402 })).toBe(true);
    expect(isNeonQuotaError({ statusCode: '402' })).toBe(true);
  });

  it('중첩된 드라이버 응답과 cause를 확인한다', () => {
    expect(isNeonQuotaError({ cause: { response: { status: 402 } } })).toBe(true);
  });

  it('HTTP 상태가 메시지에만 있는 경우를 판정한다', () => {
    expect(isNeonQuotaError(new Error('Neon request failed with HTTP status 402'))).toBe(true);
  });

  it('일반 네트워크 오류와 숫자 402가 포함된 무관한 문장은 제외한다', () => {
    expect(isNeonQuotaError(new Error('fetch failed: connection reset'))).toBe(false);
    expect(isNeonQuotaError('processed 402 rows successfully')).toBe(false);
    expect(isNeonQuotaError({ status: 429, message: 'rate limited' })).toBe(false);
  });

  it('순환 cause를 안전하게 처리한다', () => {
    const error: { message: string; cause?: unknown } = { message: 'ordinary failure' };
    error.cause = error;
    expect(isNeonQuotaError(error)).toBe(false);
  });
});
