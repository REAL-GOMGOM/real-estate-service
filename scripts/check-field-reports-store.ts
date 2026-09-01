/**
 * Opt-in, real-Redis verification. Never reads production feature credentials.
 *
 * node --conditions=react-server --import tsx scripts/check-field-reports-store.ts --run-required
 *
 * Set only NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_URL / _TOKEN explicitly. This
 * script intentionally does not load .env files or use Redis.fromEnv().
 */
import { createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { Redis } from '@upstash/redis';
import {
  CREATE_REPORT_SCRIPT, FLAG_REPORT_SCRIPT, MODERATE_REPORT_SCRIPT,
  RATE_LIMIT_SCRIPT, createFieldReportStore, reportDeduplicationKey,
} from '../lib/field-reports/store';
import { FIELD_REPORT_RETENTION_DAYS } from '../lib/field-reports/types';
import { kstDate, type FieldReportInput } from '../lib/field-reports/validation';

const DAY_MS = 86_400_000;
export const SMOKE_TTL_MS = 120_000;
const SMOKE_PREFIX = /^naezip:field-reports:smoke:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ITEM_SUFFIX = /^item:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEDUPE_SUFFIX = /^dedupe:[0-9a-f]{64}$/;
const RATE_SUFFIX = /^rate:\d{4}-\d{2}-\d{2}:(submit|flag):(total|[0-9a-f]{64})$/;
const SCRIPTS = new Set([CREATE_REPORT_SCRIPT, MODERATE_REPORT_SCRIPT, FLAG_REPORT_SCRIPT, RATE_LIMIT_SCRIPT]);

type SmokeFailureCode = 'explicit-run-required' | 'unexpected-argument' | 'test-credentials-required' |
  'invalid-test-url' | 'invalid-test-token' | 'unsafe-namespace' | 'unsafe-key' |
  'unexpected-script' | 'invalid-eval-response' | 'lua-operation-failed' |
  'assertion-failed' | 'cleanup-failed' | 'redis-operation-failed';

export class SmokeFailure extends Error {
  constructor(readonly code: SmokeFailureCode) { super(code); this.name = 'SmokeFailure'; }
}

/** Raw provider errors may contain URLs, tokens or payloads: never stringify them. */
export function smokeFailureMessage(error: unknown): string {
  return error instanceof SmokeFailure ? error.code : 'redis-operation-failed';
}

export function parseSmokeOptions(argv: string[], env: Record<string, string | undefined>) {
  if (!argv.includes('--run-required')) throw new SmokeFailure('explicit-run-required');
  if (argv.length !== 1 || argv[0] !== '--run-required') throw new SmokeFailure('unexpected-argument');
  const url = env.NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_URL?.trim();
  const token = env.NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_TOKEN?.trim();
  if (!url || !token) throw new SmokeFailure('test-credentials-required');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new SmokeFailure('invalid-test-url'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new SmokeFailure('invalid-test-url');
  }
  if (/[\x00-\x20\x7f]/.test(token)) throw new SmokeFailure('invalid-test-token');
  return { url, token };
}

export function assertSmokeKey(prefix: string, key: string): void {
  if (!SMOKE_PREFIX.test(prefix)) throw new SmokeFailure('unsafe-namespace');
  if (!key.startsWith(`${prefix}:`)) throw new SmokeFailure('unsafe-key');
  const suffix = key.slice(prefix.length + 1);
  if (suffix !== 'all' && suffix !== 'published' && !ITEM_SUFFIX.test(suffix) && !DEDUPE_SUFFIX.test(suffix) && !RATE_SUFFIX.test(suffix)) {
    throw new SmokeFailure('unsafe-key');
  }
}

/**
 * Runs the application's unchanged Lua body in a function, observes its TTLs,
 * then caps only its explicit KEYS atomically. Even a caught Lua error or a
 * lost HTTP response cannot leave a 90-day smoke fixture behind. KEEPTTL is
 * still tested before this cap, so an accidental TTL refresh is detectable.
 */
export function smokeWrappedScript(script: string): string {
  if (!SCRIPTS.has(script)) throw new SmokeFailure('unexpected-script');
  return `
local ok, result = pcall(function()
${script}
end)
local originalTtls = {}
for index, key in ipairs(KEYS) do
  local ttl = redis.call('PTTL', key)
  originalTtls[index] = ttl
  if ttl == -1 or ttl > ${SMOKE_TTL_MS} then
    redis.call('PEXPIRE', key, ${SMOKE_TTL_MS})
  end
end
if not ok then return {0, 0, originalTtls} end
return {1, result, originalTtls}
`;
}

type Observation = { script: string; keys: string[]; originalTtls: number[] };

export function createGuardedSmokeClient(redis: Redis, prefix: string) {
  // Validate before allowing even a harmless empty read.
  assertSmokeKey(prefix, `${prefix}:all`);
  const keys = new Set<string>();
  const observations: Observation[] = [];
  const track = (key: string) => { assertSmokeKey(prefix, key); keys.add(key); };
  const guarded: Pick<Redis, 'eval' | 'zrange' | 'mget'> = {
    async eval<TArgs extends unknown[], TData = unknown>(script: string, scriptKeys: string[], args: TArgs): Promise<TData> {
      const wrapped = smokeWrappedScript(script);
      scriptKeys.forEach(track);
      const response = await redis.eval<TArgs, unknown>(wrapped, scriptKeys, args);
      if (!Array.isArray(response) || response.length !== 3 || !Array.isArray(response[2]) || response[2].length !== scriptKeys.length || !response[2].every((ttl) => typeof ttl === 'number')) {
        throw new SmokeFailure('invalid-eval-response');
      }
      observations.push({ script, keys: [...scriptKeys], originalTtls: response[2] });
      if (response[0] !== 1) throw new SmokeFailure('lua-operation-failed');
      return response[1] as TData;
    },
    zrange: (...args) => { track(args[0]); return redis.zrange(...args); },
    mget: (...args) => { args.flat().forEach(track); return redis.mget(...args); },
  };
  return {
    // FieldReportStore uses only these three methods; the production store
    // implementation itself is exercised, not replaced by a fake repository.
    storeRedis: guarded as Redis,
    observations,
    async ttl(key: string) { track(key); return redis.pttl(key); },
    async get<T>(key: string) { track(key); return redis.get<T>(key); },
    async shortenTtl(key: string, milliseconds: number) {
      track(key);
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || milliseconds > SMOKE_TTL_MS) throw new SmokeFailure('unsafe-key');
      return redis.pexpire(key, milliseconds);
    },
    async seedCounter(key: string, count: number) {
      track(key);
      if (!RATE_SUFFIX.test(key.slice(prefix.length + 1)) || !Number.isSafeInteger(count) || count < 0 || count > 500) throw new SmokeFailure('unsafe-key');
      await redis.set(key, count, { px: SMOKE_TTL_MS });
    },
    async cleanup() {
      const exactKeys = [...keys];
      exactKeys.forEach((key) => assertSmokeKey(prefix, key));
      if (!exactKeys.length) return;
      await redis.del(...exactKeys);
      if (await redis.exists(...exactKeys) !== 0) throw new SmokeFailure('cleanup-failed');
    },
  };
}

function ensure(condition: unknown): asserts condition {
  if (!condition) throw new SmokeFailure('assertion-failed');
}

export async function runFieldReportStoreSmoke(redis: Redis, log: (message: string) => void = console.log) {
  const prefix = `naezip:field-reports:smoke:${randomUUID()}`;
  const client = createGuardedSmokeClient(redis, prefix);
  const store = createFieldReportStore(client.storeRedis, prefix);
  const now = new Date();
  const input: FieldReportInput = {
    apartmentId: 'smoke-only-not-a-real-apartment', area: 84.5, tradeType: 'sale',
    price: 10_000, monthlyRent: null, contractDate: kstDate(now), source: 'participant',
  };
  const apartment = { name: '검증용 가상 단지 (실제 제보 아님)', sido: '검증용', sigungu: '검증용', dong: null };
  const itemKey = (id: string) => `${prefix}:item:${id}`;
  const lastOriginalTtl = (script: string, key: string) => {
    const observation = client.observations.findLast((entry) => entry.script === script && entry.keys.includes(key));
    ensure(observation);
    return observation.originalTtls[observation.keys.indexOf(key)];
  };
  let stage = 'initialization';
  try {
    stage = 'create-and-concurrent-deduplication';
    ensure((await store.listPublic()).length === 0 && (await store.listAdmin()).length === 0);
    log('[field-reports-store-check] DIAG empty indexes');
    // Wait for every request before cleanup, including when a sibling failed.
    const concurrent = await Promise.allSettled(Array.from({ length: 5 }, () => store.create(input, apartment, now)));
    ensure(concurrent.every((result) => result.status === 'fulfilled'));
    log('[field-reports-store-check] DIAG concurrent creates fulfilled');
    const receipts = concurrent.map((result) => { ensure(result.status === 'fulfilled'); return result.value; });
    ensure(new Set(receipts).size === 1);
    log('[field-reports-store-check] DIAG concurrent receipts deduplicated');
    const receipt = receipts[0];
    const privateKey = itemKey(receipt);
    const draft = await store.listAdmin();
    ensure(draft.length === 1 && draft[0].status === 'pending' && draft[0].publishedAt === null);
    log('[field-reports-store-check] DIAG pending draft readable');
    ensure((await store.listPublic()).length === 0);
    log('[field-reports-store-check] DIAG pending draft private');
    ensure(await client.get(`${prefix}:dedupe:${reportDeduplicationKey(input)}`) === receipt);
    log('[field-reports-store-check] DIAG dedupe pointer readable');
    const originalCreate = client.observations.find((entry) => entry.script === CREATE_REPORT_SCRIPT && entry.keys[0] === privateKey);
    const expectedRetentionMs = FIELD_REPORT_RETENTION_DAYS * DAY_MS;
    // Managed Redis can decrement PTTL by a few milliseconds between SET and
    // observation. Verify the configured 90-day retention with a narrow bound,
    // rather than requiring a clock-impossible exact millisecond value.
    ensure(originalCreate && originalCreate.originalTtls[0] <= expectedRetentionMs && originalCreate.originalTtls[0] >= expectedRetentionMs - 5_000);
    log('[field-reports-store-check] DIAG original retention observed');
    ensure(await client.ttl(privateKey) > 0 && await client.ttl(privateKey) <= SMOKE_TTL_MS);
    log('[field-reports-store-check] DIAG smoke ttl capped');
    ensure(!await store.flag(receipt, 'false_information', now));
    log('[field-reports-store-check] DIAG pending flag rejected');
    log('[field-reports-store-check] PASS create, concurrent deduplication, pending privacy, retention TTL');

    stage = 'publish-and-keep-ttl';
    let beforeTtl = await client.ttl(privateKey);
    ensure(await store.moderate(receipt, 'published', now));
    log('[field-reports-store-check] DIAG publish mutation applied');
    ensure(lastOriginalTtl(MODERATE_REPORT_SCRIPT, privateKey) > 0 && lastOriginalTtl(MODERATE_REPORT_SCRIPT, privateKey) <= beforeTtl + 5_000);
    log('[field-reports-store-check] DIAG publish ttl retained');
    let publicRows = await store.listPublic(now);
    ensure(publicRows.length === 1 && publicRows[0].id === receipt);
    ensure(!('status' in publicRows[0]) && !('flaggedAt' in publicRows[0]) && !('flagReason' in publicRows[0]) && !('expiresAt' in publicRows[0]));
    log('[field-reports-store-check] DIAG public dto readable');
    ensure(await store.moderate(receipt, 'published', new Date(now.getTime() + 1_000)));
    ensure((await store.listPublic(now))[0]?.publishedAt === publicRows[0].publishedAt);
    log('[field-reports-store-check] DIAG publish idempotent');
    log('[field-reports-store-check] PASS moderation, publication, public-field whitelist, KEEPTTL');

    stage = 'flag-and-hide';
    beforeTtl = await client.ttl(privateKey);
    ensure(await store.flag(receipt, 'false_information', now));
    ensure(lastOriginalTtl(FLAG_REPORT_SCRIPT, privateKey) > 0 && lastOriginalTtl(FLAG_REPORT_SCRIPT, privateKey) <= beforeTtl + 5_000);
    ensure(await store.flag(receipt, 'duplicate', new Date(now.getTime() + 1_000)));
    const flagged = (await store.listAdmin()).find((row) => row.id === receipt);
    ensure(flagged?.flagReason === 'false_information' && flagged.flaggedAt === now.toISOString());
    ensure((await store.listPublic(now)).length === 1);
    ensure(!await store.moderate(receipt, 'published', now));
    beforeTtl = await client.ttl(privateKey);
    ensure(await store.moderate(receipt, 'hidden', now));
    ensure(lastOriginalTtl(MODERATE_REPORT_SCRIPT, privateKey) > 0 && lastOriginalTtl(MODERATE_REPORT_SCRIPT, privateKey) <= beforeTtl + 5_000);
    ensure((await store.listPublic(now)).length === 0 && !await store.moderate(receipt, 'published', now));
    ensure(!await store.flag(receipt, 'duplicate', now));
    log('[field-reports-store-check] PASS report flags, first-flag preservation, admin hide, no republication');

    stage = 'reject-and-public-expiry';
    const rejected = await store.create({ ...input, price: input.price + 1 }, apartment, now);
    ensure(await store.moderate(rejected, 'rejected', now));
    ensure(!await store.moderate(rejected, 'published', now));
    const expired = await store.create({ ...input, price: input.price + 2 }, apartment, new Date(now.getTime() - 31 * DAY_MS));
    ensure(!await store.moderate(expired, 'published', now));
    const expiring = await store.create({ ...input, price: input.price + 3 }, apartment, now);
    ensure(await store.moderate(expiring, 'published', now));
    publicRows = await store.listPublic(now);
    ensure(publicRows.length === 1 && publicRows[0].id === expiring);
    ensure((await store.listPublic(new Date(now.getTime() + 31 * DAY_MS))).length === 0);
    ensure(await client.get(itemKey(expiring)) !== null);
    await client.shortenTtl(itemKey(expiring), 100);
    const expiryDeadline = Date.now() + 4_000;
    while (await client.get(itemKey(expiring)) !== null && Date.now() < expiryDeadline) await delay(100);
    ensure(await client.get(itemKey(expiring)) === null);
    ensure((await store.listPublic(now)).length === 0);
    log('[field-reports-store-check] PASS rejection, 30-day public expiry, Redis expiry, stale-index safety');

    stage = 'rate-limits';
    const salt = randomUUID();
    const ip = '192.0.2.1'; // Documentation-only fixture, never a visitor IP.
    const rateKey = (kind: 'submit' | 'flag', address: string, date: Date) => `${prefix}:rate:${kstDate(date)}:${kind}:${createHmac('sha256', salt).update(`${kstDate(date)}:${address}`).digest('hex')}`;
    for (const kind of ['submit', 'flag'] as const) {
      const limit = kind === 'submit' ? 3 : 10;
      for (let count = 0; count < limit; count += 1) ensure(await store.consumeRateLimit(kind, ip, salt, now));
      ensure(!await store.consumeRateLimit(kind, ip, salt, now));
      const perIpKey = rateKey(kind, ip, now);
      ensure(await client.get(perIpKey) === limit);
      ensure(await client.get(`${prefix}:rate:${kstDate(now)}:${kind}:total`) === limit);
      ensure(await client.ttl(perIpKey) > 0 && await client.ttl(perIpKey) <= SMOKE_TTL_MS);
      // Last denied call retains the short TTL. A successful rate operation must
      // originally set 48 hours; the wrapper then safely shortens that TTL.
      ensure(client.observations.some((entry) => entry.script === RATE_LIMIT_SCRIPT && entry.keys.includes(perIpKey) && entry.originalTtls[0] <= 2 * DAY_MS && entry.originalTtls[0] >= 2 * DAY_MS - 5_000));

      const otherDay = new Date(now.getTime() + DAY_MS);
      const totalKey = `${prefix}:rate:${kstDate(otherDay)}:${kind}:total`;
      const globalLimit = kind === 'submit' ? 50 : 500;
      // Boundary seeding avoids hundreds of paid provider requests. The two
      // boundary operations below still run the real distributed limiter Lua.
      await client.seedCounter(totalKey, globalLimit - 1);
      ensure(await store.consumeRateLimit(kind, '192.0.2.2', salt, otherDay));
      ensure(!await store.consumeRateLimit(kind, '192.0.2.3', salt, otherDay));
      ensure(await client.get(totalKey) === globalLimit);
      ensure(await client.get(rateKey(kind, '192.0.2.3', otherDay)) === null);
    }
    log('[field-reports-store-check] PASS per-IP and global submit/flag limits, rate TTL, denied-request atomicity');
  } catch (error) {
    // Stage is a hard-coded label; never log receipt, credentials or payload.
    log(`[field-reports-store-check] FAIL stage=${stage} code=${smokeFailureMessage(error)}`);
    throw error instanceof SmokeFailure ? error : new SmokeFailure('redis-operation-failed');
  } finally {
    try {
      await client.cleanup();
      log('[field-reports-store-check] PASS exact-key cleanup');
    } catch {
      log('[field-reports-store-check] FAIL cleanup; isolated test keys have at most 120 seconds TTL');
      throw new SmokeFailure('cleanup-failed');
    }
  }
}

export async function main(argv = process.argv.slice(2), env: Record<string, string | undefined> = process.env) {
  const { url, token } = parseSmokeOptions(argv, env);
  const redis = new Redis({
    url, token, enableTelemetry: false, retry: { retries: 0 },
    signal: () => AbortSignal.timeout(10_000),
  });
  await runFieldReportStoreSmoke(redis);
  console.log('[field-reports-store-check] PASS all real-store checks; no live report was created');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(`[field-reports-store-check] FAILED: ${smokeFailureMessage(error)}`);
    process.exitCode = 1;
  });
}
