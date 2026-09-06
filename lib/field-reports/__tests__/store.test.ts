import { describe, expect, it, vi } from 'vitest';
import type { Redis } from '@upstash/redis';
import { CREATE_REPORT_SCRIPT, FLAG_REPORT_SCRIPT, MODERATE_REPORT_SCRIPT, createFieldReportStore, reportDeduplicationKey, toPublicFieldReport } from '../store';
import { fieldReportConfig } from '../config';
import type { AdminFieldReport } from '../types';

const now = new Date('2026-08-31T13:00:00Z');
const id = '323b6412-58ad-4de9-98ab-9fd9c9d38a9d';
const input = { apartmentId: 'test-apt', area: 84.95, tradeType: 'sale' as const, price: 83000, monthlyRent: null, contractDate: '2026-08-30', source: 'participant' as const };
const item: AdminFieldReport = { ...input, id, apartmentName: '테스트 단지', sido: '서울', sigungu: '강남구', dong: null, status: 'published', createdAt: '2026-08-30T13:00:00Z', publishedAt: '2026-08-31T12:00:00Z', expiresAt: '2026-09-29T13:00:00Z', flaggedAt: null, flagReason: null };
function fake() {
  const redis = { zrange: vi.fn().mockResolvedValue([id]), mget: vi.fn().mockResolvedValue([item]), eval: vi.fn().mockResolvedValue(1) };
  return { redis, store: createFieldReportStore(redis as unknown as Redis, 'test:field-reports') };
}
describe('private moderated field report store', () => {
  it.each(['pending', 'rejected', 'hidden'] as const)('never publishes %s items', (status) => {
    expect(toPublicFieldReport({ ...item, status }, now)).toBeNull();
  });
  it('excludes expired or unreviewed records', () => {
    expect(toPublicFieldReport({ ...item, expiresAt: now.toISOString() }, now)).toBeNull();
    expect(toPublicFieldReport({ ...item, publishedAt: null }, now)).toBeNull();
  });
  it('explicitly projects the public fields, excluding internal data', () => {
    const publicItem = toPublicFieldReport({ ...item, flaggedAt: now.toISOString(), flagReason: 'duplicate', privateToken: 'DO-NOT-RETURN' } as AdminFieldReport, now);
    expect(publicItem?.price).toBe(83000);
    expect(JSON.stringify(publicItem)).not.toMatch(/flag|privateToken|DO-NOT-RETURN|expiresAt|status/);
  });
  it('does not trust index membership as publication approval', async () => {
    const { redis, store } = fake();
    redis.mget.mockResolvedValue([{ ...item, status: 'pending' }, { ...item, status: 'hidden' }, null, 'corrupt']);
    expect(await store.listPublic(now)).toEqual([]);
  });
  it.each(['participant', 'agent', 'neighbor', 'anonymous', 'field_news'] as const)('reads the supported persisted source %s', async (source) => {
    const { redis, store } = fake();
    redis.mget.mockResolvedValue([{ ...item, source }]);
    expect((await store.listPublic(now))[0]?.source).toBe(source);
  });
  it('normalizes absent nullable metadata without inventing a complaint or changing hidden status', async () => {
    const { redis, store } = fake();
    const legacy: Record<string, unknown> = { ...item, status: 'hidden' };
    for (const key of ['dong', 'monthlyRent', 'publishedAt', 'flaggedAt', 'flagReason']) delete legacy[key];
    redis.mget.mockResolvedValue([legacy]);
    expect((await store.listAdmin())[0]).toMatchObject({
      status: 'hidden', dong: null, monthlyRent: null, publishedAt: null,
      flaggedAt: null, flagReason: null,
    });
    expect(await store.listPublic(now)).toEqual([]);
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it('preserves actual or malformed complaint metadata instead of treating it as absent', async () => {
    const { redis, store } = fake();
    redis.mget.mockResolvedValue([
      { ...item, flaggedAt: undefined, flagReason: 'personal_information' },
      { ...item, flaggedAt: 'invalid-date', flagReason: null },
    ]);
    expect(await store.listAdmin()).toEqual([
      { ...item, flaggedAt: null, flagReason: 'personal_information' },
      { ...item, flaggedAt: 'invalid-date', flagReason: null },
    ]);
  });
  it('supports authorized restoration of unflagged hidden reports without changing expiry or record TTL', () => {
    expect(MODERATE_REPORT_SCRIPT).toContain("item.status ~= 'pending' and item.status ~= 'hidden'");
    expect(MODERATE_REPORT_SCRIPT).toContain("if ARGV[1] == 'hidden' and item.status == 'rejected' then return 0 end");
    expect(MODERATE_REPORT_SCRIPT).toContain('item.flaggedAt ~= nil and item.flaggedAt ~= cjson.null');
    expect(MODERATE_REPORT_SCRIPT).toContain('item.flagReason ~= nil and item.flagReason ~= cjson.null');
    expect(MODERATE_REPORT_SCRIPT).toContain('if item.expiresAt <= ARGV[2] or flagged then return 0 end');
    expect(MODERATE_REPORT_SCRIPT).toContain("redis.call('SET', KEYS[1], cjson.encode(item), 'KEEPTTL')");
    expect(MODERATE_REPORT_SCRIPT).not.toContain('item.expiresAt =');
    expect(MODERATE_REPORT_SCRIPT).not.toContain('item.flaggedAt =');
  });
  it('accepts the first actual complaint when old nullable fields are missing and preserves existing complaint reasons', () => {
    expect(FLAG_REPORT_SCRIPT).toContain('(item.flaggedAt == nil or item.flaggedAt == cjson.null)');
    expect(FLAG_REPORT_SCRIPT).toContain('(item.flagReason == nil or item.flagReason == cjson.null)');
  });
  it('never republishes a hidden report through anonymous duplicate submission', () => {
    expect(CREATE_REPORT_SCRIPT.trimStart()).toMatch(/^local prior = redis.call\('GET', KEYS\[3\]\)\nif prior then return prior end/);
    expect(CREATE_REPORT_SCRIPT).not.toContain(':published');
  });
  it('inserts an immutable pending record with 90-day TTL via one atomic operation', async () => {
    const { redis, store } = fake(); redis.eval.mockResolvedValue(id);
    expect(await store.create(input, { name: '서버가 확인한 단지', sido: '서울', sigungu: '강남구', dong: null }, now)).toBe(id);
    const [, keys, args] = redis.eval.mock.calls[0];
    expect(keys.every((key: string) => key.startsWith('test:field-reports:'))).toBe(true);
    const record = JSON.parse(args[0]);
    expect(record).toMatchObject({ status: 'pending', publishedAt: null, apartmentName: '서버가 확인한 단지', expiresAt: '2026-09-30T13:00:00.000Z' });
    expect(args[5]).toBe(String(90 * 86400));
    expect(JSON.stringify(record)).not.toMatch(/fingerprint|ipAddress/);
  });
  it('surfaces capacity/store errors, without pretending to save', async () => {
    const { redis, store } = fake(); redis.eval.mockResolvedValue('capacity');
    await expect(store.create(input, { name: '단지', sido: '서울', sigungu: '강남구', dong: null }, now)).rejects.toThrow('capacity');
  });
  it('dedupes identical contracts independently of self-described source', () => {
    expect(reportDeduplicationKey(input)).toBe(reportDeduplicationKey({ ...input, source: 'agent' }));
    expect(reportDeduplicationKey(input)).toBe(reportDeduplicationKey({ ...input, source: 'anonymous' }));
    expect(reportDeduplicationKey(input)).not.toBe(reportDeduplicationKey({ ...input, price: 84000 }));
  });
  it('only sends HMAC identifiers to the rate-limit store', async () => {
    const { redis, store } = fake();
    expect(await store.consumeRateLimit('submit', '192.0.2.10', 'a'.repeat(32), now)).toBe(true);
    const [, keys, args] = redis.eval.mock.calls[0];
    expect(JSON.stringify(keys)).not.toContain('192.0.2.10');
    expect(keys[0]).toMatch(/2026-08-31:submit:[a-f0-9]{64}$/);
    expect(args).toEqual(['3', '50']);
  });
  it('rejects invalid admin IDs before store access', async () => {
    const { redis, store } = fake();
    expect(await store.moderate('other:key', 'published', now)).toBe(false);
    expect(redis.eval).not.toHaveBeenCalled();
  });
  it('atomically prunes published index members older than retention without changing publication or hide behavior', async () => {
    const { redis, store } = fake();
    expect(await store.moderate(id, 'published', now)).toBe(true);

    const [script, keys, args] = redis.eval.mock.calls[0];
    expect(script).toBe(MODERATE_REPORT_SCRIPT);
    expect(keys).toEqual([`test:field-reports:item:${id}`, 'test:field-reports:published']);
    expect(args).toEqual([
      'published',
      now.toISOString(),
      String(now.getTime()),
      String(90 * 86_400),
      String(now.getTime() - 90 * 86_400_000),
    ]);
    expect(script).toContain("redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[5])");
    expect(script.indexOf("redis.call('ZREMRANGEBYSCORE'")).toBeLessThan(script.indexOf("redis.call('ZADD'"));

    // Public visibility remains bounded to 30 days from receipt, independently
    // of the longer private-retention/index-cleanup window.
    const productionTimestampItem = { ...item, expiresAt: '2026-09-29T13:00:00.000Z' };
    expect(toPublicFieldReport(productionTimestampItem, new Date('2026-09-29T12:59:59Z'))).not.toBeNull();
    expect(toPublicFieldReport(productionTimestampItem, new Date('2026-09-29T13:00:00Z'))).toBeNull();

    redis.eval.mockClear();
    expect(await store.moderate(id, 'hidden', now)).toBe(true);
    const [hideScript, , hideArgs] = redis.eval.mock.calls[0];
    expect(hideScript).toContain("redis.call('ZREM', KEYS[2], item.id)");
    expect(hideArgs[0]).toBe('hidden');
  });
  it('never implicitly reuses legacy or visitor Redis credentials', () => {
    expect(fieldReportConfig({ KV_REST_API_URL: 'https://test.upstash.io', KV_REST_API_TOKEN: 'token', NAEZIP_FIELD_REPORTS_ENABLED: '1' }).configured).toBe(false);
    const env = { NAEZIP_FIELD_REPORTS_REDIS_REST_URL: 'https://test.upstash.io', NAEZIP_FIELD_REPORTS_REDIS_REST_TOKEN: 'token', NAEZIP_FIELD_REPORTS_ENABLED: '1', NAEZIP_FIELD_REPORTS_IP_SALT: 'a'.repeat(32) };
    expect(fieldReportConfig(env).submissionsEnabled).toBe(true);
    expect(fieldReportConfig({ ...env, NAEZIP_FIELD_REPORTS_IP_SALT: '' }).submissionsEnabled).toBe(false);
    expect(fieldReportConfig({ ...env, VERCEL_ENV: 'production' }).prefix).not.toBe(fieldReportConfig(env).prefix);
  });
  it('only reuses the managed visitor store with an explicit source selection', () => {
    const env = { UPSTASH_REDIS_REST_KV_REST_API_URL: 'https://visitors.upstash.io', UPSTASH_REDIS_REST_KV_REST_API_TOKEN: 'visitor-token', NAEZIP_FIELD_REPORTS_ENABLED: '1', NAEZIP_FIELD_REPORTS_IP_SALT: 'b'.repeat(32) };
    expect(fieldReportConfig(env).configured).toBe(false);
    expect(fieldReportConfig({ ...env, NAEZIP_FIELD_REPORTS_REDIS_SOURCE: 'visitors', VERCEL_ENV: 'preview' })).toMatchObject({ configured: true, submissionsEnabled: true, source: 'visitors', prefix: 'naezip:field-reports:v1:preview' });
    expect(fieldReportConfig({ ...env, NAEZIP_FIELD_REPORTS_REDIS_SOURCE: 'typo' }).configured).toBe(false);
  });
  it('does not switch to a different store when the chosen store credentials are missing', () => {
    expect(fieldReportConfig({ NAEZIP_FIELD_REPORTS_REDIS_SOURCE: 'visitors', NAEZIP_FIELD_REPORTS_REDIS_REST_URL: 'https://dedicated.upstash.io', NAEZIP_FIELD_REPORTS_REDIS_REST_TOKEN: 'token', KV_REST_API_URL: 'https://retired.upstash.io', KV_REST_API_TOKEN: 'old-token' }).configured).toBe(false);
  });
});
