import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createFieldReportRedis: vi.fn(), runFieldReportStoreSmoke: vi.fn() }));
vi.mock('@/lib/field-reports/config', () => ({ createFieldReportRedis: mocks.createFieldReportRedis }));
vi.mock('@/scripts/check-field-reports-store', () => ({ runFieldReportStoreSmoke: mocks.runFieldReportStoreSmoke }));

import * as route from '../route';

const { GET, HEAD, POST, maxDuration } = route;

const secret = 'preview-check-test-token-32-chars-minimum';
const endpoint = 'https://preview.example.com/api/ops/field-reports-check';
const request = (authorization: string | null = `Bearer ${secret}`, body?: string, query = '', transportHeaders: Record<string, string> = {}) => new Request(`${endpoint}${query}`, {
  method: 'POST', headers: { ...(authorization === null ? {} : { authorization }), ...transportHeaders }, ...(body === undefined ? {} : { body }),
});

describe('Preview-only field-report real-store check route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('NAEZIP_FIELD_REPORTS_CHECK_ENABLED', '1');
    vi.stubEnv('NAEZIP_FIELD_REPORTS_CHECK_TOKEN', secret);
    mocks.createFieldReportRedis.mockReturnValue({ isolatedTestClient: true });
    mocks.runFieldReportStoreSmoke.mockResolvedValue(undefined);
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it.each(['production', 'development', '', undefined])('is 404 outside Preview (%s), without resolving or contacting Redis', async (environment) => {
    vi.stubEnv('VERCEL_ENV', environment);
    const response = await POST(request());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not-found' });
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it.each(['0', 'true', '', undefined])('requires explicit enabled=1 (%s), before any Redis call', async (enabled) => {
    vi.stubEnv('NAEZIP_FIELD_REPORTS_CHECK_ENABLED', enabled);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it.each(['', undefined, 'x'.repeat(31), ' '.repeat(32), `prefix${'x'.repeat(32)}\nsecret`])('hides the route for missing/weak/invalid configured token %#', async (configuredToken) => {
    vi.stubEnv('NAEZIP_FIELD_REPORTS_CHECK_TOKEN', configuredToken);
    expect((await POST(request())).status).toBe(404);
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it.each([null, '', 'Bearer wrong', `Basic ${secret}`, secret, `Bearer ${secret}suffix`, `Bearer ${secret.slice(0, -1)}X`])('returns 401 for missing/incorrect Bearer auth %# without touching Redis', async (authorization) => {
    const response = await POST(request(authorization));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it.each(['preview', 'production', 'development'])('GET and HEAD never expose the check in %s', async (environment) => {
    vi.stubEnv('VERCEL_ENV', environment);
    expect(GET().status).toBe(404);
    const head = HEAD();
    expect(head.status).toBe(404);
    expect(await head.text()).toBe('');
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it.each<{ body: string | undefined; query: string }>([
    { body: '{"namespace":"naezip:field-reports:v1:production"}', query: '' },
    { body: undefined, query: '?url=https://attacker.example.com&token=secret' },
  ])('rejects arbitrary payload/query inputs %# without parsing or calling Redis', async ({ body, query }) => {
    const input = request(`Bearer ${secret}`, body, query);
    const json = vi.spyOn(input, 'json');
    const text = vi.spyOn(input, 'text');
    const arrayBuffer = vi.spyOn(input, 'arrayBuffer');
    const response = await POST(input);
    expect(response.status).toBe(400);
    expect(json).not.toHaveBeenCalled();
    expect(text).not.toHaveBeenCalled();
    if (query) expect(arrayBuffer).not.toHaveBeenCalled();
    else expect(arrayBuffer).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it.each<{ body: string; headers: Record<string, string> }>([
    { body: '{}', headers: { 'content-length': '2' } },
    { body: '', headers: { 'content-length': '1' } },
    { body: '', headers: { 'content-length': '-1' } },
    { body: '', headers: { 'content-length': '00' } },
  ])('rejects nonzero, malformed, or chunked transport before buffering %#', async ({ body, headers }) => {
    const input = request(`Bearer ${secret}`, body, '', headers);
    const arrayBuffer = vi.spyOn(input, 'arrayBuffer');
    expect((await POST(input)).status).toBe(400);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it('rejects an unknown-length stream after verifying its bytes', async () => {
    const input = request(`Bearer ${secret}`, 'payload');
    expect(input.headers.get('content-length')).toBeNull();
    const arrayBuffer = vi.spyOn(input, 'arrayBuffer');
    expect((await POST(input)).status).toBe(400);
    expect(arrayBuffer).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
  });

  it('allows Vercel chunked transport only when the verified body is empty', async () => {
    const empty = request(`Bearer ${secret}`, '', '', { 'transfer-encoding': 'chunked' });
    expect((await POST(empty)).status).toBe(200);
    const payload = request(`Bearer ${secret}`, '{}', '', { 'transfer-encoding': 'chunked' });
    expect((await POST(payload)).status).toBe(400);
  });

  it('allows a bodyless Request and verifies zero bytes before running Redis', async () => {
    const input = request();
    const arrayBuffer = vi.spyOn(input, 'arrayBuffer');
    expect((await POST(input)).status).toBe(200);
    expect(arrayBuffer).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.createFieldReportRedis).toHaveBeenCalledExactlyOnceWith();
  });

  it('allows Vercel/curl empty POST streams declared as Content-Length: 0', async () => {
    const input = request(`Bearer ${secret}`, '', '', { 'content-length': '0' });
    expect(input.body).not.toBeNull();
    const arrayBuffer = vi.spyOn(input, 'arrayBuffer');
    expect((await POST(input)).status).toBe(200);
    expect(arrayBuffer).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.createFieldReportRedis).toHaveBeenCalledExactlyOnceWith();
  });

  it('rejects bytes hidden behind a forged Content-Length: 0 after bounded verification', async () => {
    const input = request(`Bearer ${secret}`, 'payload', '', { 'content-length': '0' });
    const arrayBuffer = vi.spyOn(input, 'arrayBuffer');
    expect((await POST(input)).status).toBe(400);
    expect(arrayBuffer).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.createFieldReportRedis).not.toHaveBeenCalled();
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
  });

  it('uses only configured Redis after every gate and returns only allowlisted data-free check labels', async () => {
    const redis = { actualConfiguredClient: true };
    mocks.createFieldReportRedis.mockReturnValue(redis);
    mocks.runFieldReportStoreSmoke.mockImplementation(async (_redis, log: (message: string) => void) => {
      log('[field-reports-store-check] PASS create, concurrent deduplication, pending privacy, retention TTL');
      log('token=secret url=https://sensitive.example.com receipt=00000000-0000-4000-8000-000000000001');
      log('[field-reports-store-check] PASS exact-key cleanup');
      log('[field-reports-store-check] PASS exact-key cleanup');
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.createFieldReportRedis).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.runFieldReportStoreSmoke).toHaveBeenCalledExactlyOnceWith(redis, expect.any(Function));
    await expect(response.json()).resolves.toEqual({ status: 'passed', checks: ['create-deduplicate-pending-retention', 'exact-key-cleanup'] });
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('does not leak storage configuration errors to the response or console', async () => {
    mocks.createFieldReportRedis.mockImplementation(() => { throw new Error(`provider-token=${secret} https://sensitive.example.com`); });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'failed', error: 'store-check-failed', checks: [] });
    expect(mocks.runFieldReportStoreSmoke).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns partial safe checks, never raw provider errors or fixture data on smoke failure', async () => {
    mocks.runFieldReportStoreSmoke.mockImplementation(async (_redis, log: (message: string) => void) => {
      log('[field-reports-store-check] PASS moderation, publication, public-field whitelist, KEEPTTL');
      log('[field-reports-store-check] FAIL unknown-content=secret');
      log('[field-reports-store-check] PASS exact-key cleanup');
      throw new Error(`redis://token:${secret}@sensitive.example.com full-fixture-record`);
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: 'failed', error: 'store-check-failed', checks: ['moderation-publication-whitelist-keep-ttl', 'exact-key-cleanup'] });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns only allowlisted hard-coded failure diagnostics after a failed smoke run', async () => {
    mocks.runFieldReportStoreSmoke.mockImplementation(async (_redis, log: (message: string) => void) => {
      log('[field-reports-store-check] FAIL stage=create-and-concurrent-deduplication code=assertion-failed');
      log('[field-reports-store-check] PASS exact-key cleanup');
      throw new Error('provider details must stay private');
    });
    const response = await POST(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'failed', error: 'store-check-failed', checks: ['exact-key-cleanup'],
      failedStage: 'create-and-concurrent-deduplication', failureCode: 'assertion-failed',
    });
  });

  it.each([
    '[field-reports-store-check] FAIL stage=unknown code=assertion-failed',
    '[field-reports-store-check] FAIL stage=rate-limits code=unknown',
    '[field-reports-store-check] FAIL stage=rate-limits code=redis-operation-failed secret=leaked',
    '[field-reports-store-check] FAIL stage=rate-limits code=redis-operation-failed\nsecret=leaked',
    '[field-reports-store-check] FAIL stage=rate-limits code=https://sensitive.example.com',
  ])('ignores non-allowlisted or extended failure output %#', async (unsafeMessage) => {
    mocks.runFieldReportStoreSmoke.mockImplementation(async (_redis, log: (message: string) => void) => {
      log(unsafeMessage);
      throw new Error('secret');
    });
    const response = await POST(request());
    await expect(response.json()).resolves.toEqual({ status: 'failed', error: 'store-check-failed', checks: [] });
  });

  it('keeps the default Node runtime without a cacheComponents-incompatible override', () => {
    expect(route).not.toHaveProperty('runtime');
    expect(maxDuration).toBe(60);
  });
});
