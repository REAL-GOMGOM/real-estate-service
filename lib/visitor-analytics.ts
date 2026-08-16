import 'server-only';

import { createHmac } from 'node:crypto';
import { Redis } from '@upstash/redis';

export const VISITOR_SUMMARY_SCHEMA = 'naezip.visitor-summary.v1' as const;
export const VISITOR_SUMMARY_SCOPE = 'analytics-consent' as const;
export const VISITOR_DAILY_RETENTION_DAYS = 35;

const KEY_PREFIX = 'naezip:visitors:v1';
const LIFETIME_KEY = `${KEY_PREFIX}:lifetime`;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const BOT_USER_AGENT = /(?:\bbot\b|bot[/; _-]|crawl|spider|slurp|headless|lighthouse|pagespeed|monitor|pingdom|uptime|curl|wget|python-requests|go-http-client|node-fetch|axios|postmanruntime|insomnia|facebookexternalhit|bingpreview)/i;

type VisitorUnavailableReason = 'not-configured' | 'store-unavailable';

export interface VisitorSummary {
  schema: typeof VISITOR_SUMMARY_SCHEMA;
  status: 'available' | 'unavailable';
  scope: typeof VISITOR_SUMMARY_SCOPE;
  approximate: true;
  today: number | null;
  last7Days: number | null;
  total: number | null;
  updatedAt: string;
  reason: VisitorUnavailableReason | null;
}

interface VisitorAggregateWrite {
  dailyKey: string;
  lifetimeKey: string;
  fingerprint: string;
  expiresAtUnix: number;
}

interface VisitorAggregateRead {
  todayKey: string;
  last7DayKeys: string[];
  lifetimeKey: string;
}

interface VisitorAggregateCounts {
  today: unknown;
  last7Days: unknown;
  total: unknown;
}

export interface VisitorAggregateStore {
  add(input: VisitorAggregateWrite): Promise<void>;
  read(input: VisitorAggregateRead): Promise<VisitorAggregateCounts>;
}

interface VisitorEnvironment {
  [key: string]: string | undefined;
  VERCEL_ENV?: string;
  VISITOR_FINGERPRINT_SALT?: string;
  ADMIN_IP_ALLOWLIST?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
}

export interface RecordVisitorInput {
  ip: string | null;
  userAgent: string | null;
  now?: Date;
  env?: VisitorEnvironment;
  store?: VisitorAggregateStore;
}

function createRedisVisitorStore(env: VisitorEnvironment): VisitorAggregateStore {
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) throw new Error('visitor Redis is not configured');

  // 방문 집계는 리포트용 KV와 절대 섞지 않고 전용 Upstash 설정만 사용한다.
  const redis = new Redis({ url, token });
  return {
    async add({ dailyKey, lifetimeKey, fingerprint, expiresAtUnix }) {
      await redis
        .pipeline()
        .pfadd(dailyKey, fingerprint)
        .expireat(dailyKey, expiresAtUnix)
        .pfadd(lifetimeKey, fingerprint)
        .exec();
    },
    async read({ todayKey, last7DayKeys, lifetimeKey }) {
      const [firstDayKey, ...remainingDayKeys] = last7DayKeys;
      if (!firstDayKey) throw new Error('at least one daily key is required');
      const [today, last7Days, total] = await redis
        .pipeline()
        .pfcount(todayKey)
        .pfcount(firstDayKey, ...remainingDayKeys)
        .pfcount(lifetimeKey)
        .exec();
      return { today, last7Days, total };
    },
  };
}

export function getVisitorClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-vercel-forwarded-for')
    ?? headers.get('x-forwarded-for')
    ?? headers.get('x-real-ip');
  const first = forwarded?.split(',', 1)[0]?.trim().replace(/^"|"$/g, '');
  return first || null;
}

export function isObviousBot(userAgent: string): boolean {
  return BOT_USER_AGENT.test(userAgent);
}

export function isAdminIp(ip: string, allowlist = process.env.ADMIN_IP_ALLOWLIST): boolean {
  if (!allowlist) return false;
  return allowlist
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(ip);
}

export function createVisitorFingerprint(ip: string, salt: string): string {
  return createHmac('sha256', salt)
    .update(ip)
    .digest('hex');
}

export function visitorDayKey(now: Date, dayOffset = 0): string {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS - dayOffset * DAY_MS);
  return `${KEY_PREFIX}:day:${shifted.toISOString().slice(0, 10)}`;
}

function dailyExpiryUnix(now: Date): number {
  const shifted = new Date(now.getTime() + KST_OFFSET_MS);
  const kstDayStartAsUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  ) - KST_OFFSET_MS;
  return Math.floor((kstDayStartAsUtc + VISITOR_DAILY_RETENTION_DAYS * DAY_MS) / 1_000);
}

function hasVisitorConfiguration(env: VisitorEnvironment): boolean {
  const salt = env.VISITOR_FINGERPRINT_SALT?.trim();
  const hasVisitorRedis = Boolean(
    env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
  return Boolean(salt && salt.length >= 32 && hasVisitorRedis);
}

export async function recordVisitor({
  ip,
  userAgent,
  now = new Date(),
  env = process.env,
  store,
}: RecordVisitorInput): Promise<'recorded' | 'ignored' | 'unavailable'> {
  // Preview와 로컬 검증 트래픽은 운영 방문자 수에 섞지 않는다.
  if (env.VERCEL_ENV !== 'production') return 'ignored';
  if (!hasVisitorConfiguration(env)) return 'unavailable';
  if (!ip || !userAgent || isObviousBot(userAgent) || isAdminIp(ip, env.ADMIN_IP_ALLOWLIST)) {
    return 'ignored';
  }

  const salt = env.VISITOR_FINGERPRINT_SALT!.trim();
  // UA를 바꿔 같은 IP를 여러 방문자로 부풀리는 공격을 막기 위해 IP만 가명화한다.
  const fingerprint = createVisitorFingerprint(ip, salt);
  try {
    await (store ?? createRedisVisitorStore(env)).add({
      dailyKey: visitorDayKey(now),
      lifetimeKey: LIFETIME_KEY,
      fingerprint,
      expiresAtUnix: dailyExpiryUnix(now),
    });
    return 'recorded';
  } catch {
    return 'unavailable';
  }
}

function unavailableSummary(now: Date, reason: VisitorUnavailableReason): VisitorSummary {
  return {
    schema: VISITOR_SUMMARY_SCHEMA,
    status: 'unavailable',
    scope: VISITOR_SUMMARY_SCOPE,
    approximate: true,
    today: null,
    last7Days: null,
    total: null,
    updatedAt: now.toISOString(),
    reason,
  };
}

function validCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('invalid HyperLogLog count');
  }
  return Math.floor(value);
}

export async function getVisitorSummary({
  now = new Date(),
  env = process.env,
  store,
}: {
  now?: Date;
  env?: VisitorEnvironment;
  store?: VisitorAggregateStore;
} = {}): Promise<VisitorSummary> {
  if (!hasVisitorConfiguration(env)) return unavailableSummary(now, 'not-configured');

  try {
    const counts = await (store ?? createRedisVisitorStore(env)).read({
      todayKey: visitorDayKey(now),
      last7DayKeys: Array.from({ length: 7 }, (_, index) => visitorDayKey(now, index)),
      lifetimeKey: LIFETIME_KEY,
    });
    return {
      schema: VISITOR_SUMMARY_SCHEMA,
      status: 'available',
      scope: VISITOR_SUMMARY_SCOPE,
      approximate: true,
      today: validCount(counts.today),
      last7Days: validCount(counts.last7Days),
      total: validCount(counts.total),
      updatedAt: now.toISOString(),
      reason: null,
    };
  } catch {
    return unavailableSummary(now, 'store-unavailable');
  }
}
