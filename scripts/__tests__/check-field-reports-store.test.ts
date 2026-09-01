import { describe, expect, it, vi } from 'vitest';
import type { Redis } from '@upstash/redis';
import {
  SMOKE_TTL_MS, SmokeFailure, assertSmokeKey, createGuardedSmokeClient,
  main, parseSmokeOptions, smokeFailureMessage, smokeWrappedScript,
} from '../check-field-reports-store';
import { CREATE_REPORT_SCRIPT, MODERATE_REPORT_SCRIPT } from '../../lib/field-reports/store';

const prefix = 'naezip:field-reports:smoke:00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const credentials = { NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_URL: 'https://test.example.com', NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_TOKEN: 'test-only-token' };

describe('real field-report smoke-test safety', () => {
  it('requires the explicit one-time flag, even when test credentials exist', () => {
    expect(() => parseSmokeOptions([], credentials)).toThrow('explicit-run-required');
    expect(() => parseSmokeOptions(['--run'], credentials)).toThrow('explicit-run-required');
    expect(() => parseSmokeOptions(['--run-required', '--production'], credentials)).toThrow('unexpected-argument');
    expect(() => parseSmokeOptions(['--run-required', '--run-required'], credentials)).toThrow('unexpected-argument');
  });

  it('never falls back to production feature, legacy KV, or generic Upstash credentials', () => {
    const production = {
      NAEZIP_FIELD_REPORTS_REDIS_REST_URL: 'https://production.example.com', NAEZIP_FIELD_REPORTS_REDIS_REST_TOKEN: 'production-secret',
      UPSTASH_REDIS_REST_URL: 'https://generic.example.com', UPSTASH_REDIS_REST_TOKEN: 'generic-secret',
      KV_REST_API_URL: 'https://legacy.example.com', KV_REST_API_TOKEN: 'legacy-secret',
    };
    expect(() => parseSmokeOptions(['--run-required'], production)).toThrow('test-credentials-required');
    expect(parseSmokeOptions(['--run-required'], { ...production, ...credentials })).toEqual({ url: credentials.NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_URL, token: 'test-only-token' });
  });

  it('makes zero network requests when explicit permission or test credentials are missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(main([], credentials)).rejects.toThrow('explicit-run-required');
      await expect(main(['--run-required'], {})).rejects.toThrow('test-credentials-required');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each(['http://test.example.com', 'not-a-url', 'https://user:secret@test.example.com', 'https://test.example.com/path', 'https://test.example.com/?token=secret', 'https://test.example.com/#secret'])('rejects unsafe endpoint %s', (url) => {
    expect(() => parseSmokeOptions(['--run-required'], { ...credentials, NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_URL: url })).toThrow('invalid-test-url');
  });

  it('rejects missing test token and token control characters without echoing secrets', () => {
    expect(() => parseSmokeOptions(['--run-required'], { ...credentials, NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_TOKEN: undefined })).toThrow('test-credentials-required');
    expect(() => parseSmokeOptions(['--run-required'], { ...credentials, NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_TOKEN: 'secret\ntoken' })).toThrow('invalid-test-token');
  });

  it.each(['naezip:field-reports:v1:production', 'naezip:field-reports:v1:preview', 'naezip:field-reports:smoke:*', 'naezip:field-reports:smoke:not-a-uuid'])('rejects non-isolated namespace %s', (unsafePrefix) => {
    expect(() => assertSmokeKey(unsafePrefix, `${unsafePrefix}:all`)).toThrow('unsafe-namespace');
  });

  it('only permits exact known-key patterns under this run namespace', () => {
    for (const suffix of ['all', 'published', `item:${id}`, `dedupe:${'a'.repeat(64)}`, `rate:2026-08-31:submit:${'b'.repeat(64)}`, 'rate:2026-08-31:flag:total']) {
      expect(() => assertSmokeKey(prefix, `${prefix}:${suffix}`)).not.toThrow();
    }
    for (const key of ['naezip:field-reports:v1:production:all', `${prefix}:*`, `${prefix}:item:*`, `${prefix}:other`, `${prefix}:rate:2026-08-31:submit:raw-ip`, `${prefix}extra:all`]) {
      expect(() => assertSmokeKey(prefix, key)).toThrow('unsafe-key');
    }
  });

  it('runs only actual application Lua and caps explicit keys even after a caught Lua failure', () => {
    const wrapped = smokeWrappedScript(CREATE_REPORT_SCRIPT);
    expect(wrapped).toContain(CREATE_REPORT_SCRIPT);
    expect(wrapped).toContain('pcall(function()');
    expect(wrapped).toContain("redis.call('PTTL', key)");
    expect(wrapped).toContain(`redis.call('PEXPIRE', key, ${SMOKE_TTL_MS})`);
    expect(wrapped).not.toMatch(/FLUSH|SCAN|redis\.call\('KEYS'/i);
    expect(() => smokeWrappedScript("return redis.call('FLUSHDB')")).toThrow('unexpected-script');
  });

  it('tracks exact mutation keys before remote execution and cleans up even after a lost response', async () => {
    const evalMock = vi.fn().mockRejectedValue(new Error('provider failed token=do-not-print'));
    const del = vi.fn().mockResolvedValue(0);
    const exists = vi.fn().mockResolvedValue(0);
    const client = createGuardedSmokeClient({ eval: evalMock, del, exists } as unknown as Redis, prefix);
    const keys = [`${prefix}:item:${id}`, `${prefix}:published`];
    await expect(client.storeRedis.eval(MODERATE_REPORT_SCRIPT, keys, [])).rejects.toThrow();
    await client.cleanup();
    expect(del).toHaveBeenCalledWith(...keys);
    expect(exists).toHaveBeenCalledWith(...keys);
    expect(evalMock.mock.calls[0][0]).toContain(MODERATE_REPORT_SCRIPT);
  });

  it('rejects out-of-namespace operations before contacting Redis', async () => {
    const evalMock = vi.fn();
    const client = createGuardedSmokeClient({ eval: evalMock } as unknown as Redis, prefix);
    await expect(client.storeRedis.eval(MODERATE_REPORT_SCRIPT, ['naezip:field-reports:v1:production:all'], [])).rejects.toThrow('unsafe-key');
    expect(evalMock).not.toHaveBeenCalled();
  });

  it('unwraps actual store return values and records original TTLs for KEEPTTL assertions', async () => {
    const evalMock = vi.fn().mockResolvedValue([1, 1, [50_000, 7_776_000_000]]);
    const client = createGuardedSmokeClient({ eval: evalMock } as unknown as Redis, prefix);
    const keys = [`${prefix}:item:${id}`, `${prefix}:published`];
    expect(await client.storeRedis.eval(MODERATE_REPORT_SCRIPT, keys, [])).toBe(1);
    expect(client.observations).toEqual([{ script: MODERATE_REPORT_SCRIPT, keys, originalTtls: [50_000, 7_776_000_000] }]);
  });

  it.each([{ response: [0, 0, [10]] }, { response: [1, 1, 'invalid'] }, { response: [1, 1, [10, 20]] }])('fails closed on Lua or malformed response %#', async ({ response }) => {
    const client = createGuardedSmokeClient({ eval: vi.fn().mockResolvedValue(response) } as unknown as Redis, prefix);
    await expect(client.storeRedis.eval(MODERATE_REPORT_SCRIPT, [`${prefix}:item:${id}`], [])).rejects.toBeInstanceOf(SmokeFailure);
  });

  it('reports cleanup failure instead of claiming all test data was removed', async () => {
    const redis = { get: vi.fn().mockResolvedValue(null), del: vi.fn().mockResolvedValue(0), exists: vi.fn().mockResolvedValue(1) } as unknown as Redis;
    const client = createGuardedSmokeClient(redis, prefix);
    await client.get(`${prefix}:all`);
    await expect(client.cleanup()).rejects.toThrow('cleanup-failed');
  });

  it('never logs raw provider errors, test secrets, fixture receipts, or thrown objects', () => {
    for (const error of [new Error(`https://secret:token@example.com item:${id}`), { message: 'secret' }, 'secret', null]) {
      expect(smokeFailureMessage(error)).toBe('redis-operation-failed');
    }
    expect(smokeFailureMessage(new SmokeFailure('cleanup-failed'))).toBe('cleanup-failed');
  });
});
