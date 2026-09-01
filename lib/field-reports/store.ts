import 'server-only';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import { FIELD_REPORT_PUBLIC_DAYS, FIELD_REPORT_RETENTION_DAYS, type AdminFieldReport, type FieldReportFlagReason, type PublicFieldReport } from './types';
import type { FieldReportInput } from './validation';
import { REPORT_ID_PATTERN, kstDate } from './validation';

const DAY_MS = 86_400_000;
const RETENTION_SECONDS = FIELD_REPORT_RETENTION_DAYS * 86_400;
const MAX_RECORDS = 1_000;

// All mutations are atomic: a partial network response cannot publish a draft or
// extend retention. These scripts only address our explicitly selected namespace.
export const CREATE_REPORT_SCRIPT = `
local prior = redis.call('GET', KEYS[3])
if prior then return prior end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[4])
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then return 'capacity' end
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[6])
redis.call('SET', KEYS[3], ARGV[2], 'EX', ARGV[6])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[2])
redis.call('EXPIRE', KEYS[2], ARGV[6])
return ARGV[2]
`;

export const MODERATE_REPORT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local item = cjson.decode(raw)
if ARGV[1] == 'published' then
  redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[5])
  if item.expiresAt <= ARGV[2] or item.flaggedAt ~= cjson.null then return 0 end
  if item.status == 'published' then return 1 end
  if item.status ~= 'pending' then return 0 end
  item.publishedAt = ARGV[2]
  redis.call('ZADD', KEYS[2], ARGV[3], item.id)
  redis.call('EXPIRE', KEYS[2], ARGV[4])
else
  if ARGV[1] == 'rejected' and item.status ~= 'pending' then return 0 end
  redis.call('ZREM', KEYS[2], item.id)
end
item.status = ARGV[1]
redis.call('SET', KEYS[1], cjson.encode(item), 'KEEPTTL')
return 1
`;

export const FLAG_REPORT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local item = cjson.decode(raw)
if item.status ~= 'published' or item.expiresAt <= ARGV[2] then return 0 end
if item.flaggedAt == cjson.null then
  item.flaggedAt = ARGV[2]
  item.flagReason = ARGV[1]
  redis.call('SET', KEYS[1], cjson.encode(item), 'KEEPTTL')
end
return 1
`;

export const RATE_LIMIT_SCRIPT = `
local perIp = tonumber(redis.call('GET', KEYS[1]) or '0')
local total = tonumber(redis.call('GET', KEYS[2]) or '0')
if perIp >= tonumber(ARGV[1]) or total >= tonumber(ARGV[2]) then return 0 end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], 172800)
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], 172800)
return 1
`;

export function reportDeduplicationKey(input: FieldReportInput): string {
  return createHash('sha256').update(JSON.stringify([input.apartmentId, input.area, input.tradeType, input.price, input.monthlyRent, input.contractDate])).digest('hex');
}

export function toPublicFieldReport(item: AdminFieldReport, now = new Date()): PublicFieldReport | null {
  if (item.status !== 'published' || !item.publishedAt || !Number.isFinite(Date.parse(item.expiresAt)) || item.expiresAt <= now.toISOString()) return null;
  // Explicit whitelist: never expose moderation state or add a spread here.
  return {
    id: item.id, apartmentId: item.apartmentId, apartmentName: item.apartmentName,
    sido: item.sido, sigungu: item.sigungu, dong: item.dong, area: item.area,
    tradeType: item.tradeType, price: item.price, monthlyRent: item.monthlyRent,
    contractDate: item.contractDate, source: item.source, createdAt: item.createdAt,
    publishedAt: item.publishedAt,
  };
}

function parseStored(value: unknown): AdminFieldReport | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as AdminFieldReport;
  if (!REPORT_ID_PATTERN.test(item.id) || !['pending', 'published', 'rejected', 'hidden'].includes(item.status)) return null;
  if (typeof item.apartmentName !== 'string' || typeof item.apartmentId !== 'string' || typeof item.sido !== 'string' || typeof item.sigungu !== 'string') return null;
  if (typeof item.area !== 'number' || !Number.isFinite(item.area) || typeof item.price !== 'number' || !Number.isSafeInteger(item.price)) return null;
  if (!['sale', 'jeonse', 'monthly'].includes(item.tradeType) || !['participant', 'agent', 'neighbor'].includes(item.source)) return null;
  if (![item.createdAt, item.expiresAt].every((date) => typeof date === 'string' && Number.isFinite(Date.parse(date)))) return null;
  return item;
}

export function createFieldReportStore(redis: Redis, prefix: string) {
  const recordKey = (id: string) => `${prefix}:item:${id}`;
  async function readIndex(key: string, count: number) {
    const ids = await redis.zrange<string[]>(key, 0, count - 1, { rev: true });
    if (!ids.length) return [];
    const safeIds = ids.filter((id) => typeof id === 'string' && REPORT_ID_PATTERN.test(id));
    if (!safeIds.length) return [];
    const rows = await redis.mget<unknown[]>(...safeIds.map(recordKey));
    return rows.map(parseStored).filter((item): item is AdminFieldReport => item !== null);
  }
  return {
    async listPublic(now = new Date()) {
      const rows = await readIndex(`${prefix}:published`, 100);
      return rows.map((item) => toPublicFieldReport(item, now)).filter((item): item is PublicFieldReport => item !== null).slice(0, 20);
    },
    async listAdmin() {
      // Bounded by MAX_RECORDS. Bring pending/flagged records forward so a busy
      // public feed cannot silently bury an older report needing review.
      const rows = await readIndex(`${prefix}:all`, MAX_RECORDS);
      return rows.sort((a, b) => {
        const priority = (item: AdminFieldReport) => item.flaggedAt && item.status === 'published' ? 2 : item.status === 'pending' ? 1 : 0;
        return priority(b) - priority(a) || b.createdAt.localeCompare(a.createdAt);
      }).slice(0, 100);
    },
    async create(input: FieldReportInput, apartment: { name: string; sido: string; sigungu: string; dong: string | null }, now = new Date()) {
      const id = randomUUID();
      const item: AdminFieldReport = {
        ...input, id, apartmentName: apartment.name, sido: apartment.sido,
        sigungu: apartment.sigungu, dong: apartment.dong, status: 'pending',
        createdAt: now.toISOString(), publishedAt: null,
        expiresAt: new Date(now.getTime() + FIELD_REPORT_PUBLIC_DAYS * DAY_MS).toISOString(),
        flaggedAt: null, flagReason: null,
      };
      const receipt = await redis.eval<string[], string>(CREATE_REPORT_SCRIPT,
        [recordKey(id), `${prefix}:all`, `${prefix}:dedupe:${reportDeduplicationKey(input)}`],
        [JSON.stringify(item), id, String(now.getTime()), String(now.getTime() - RETENTION_SECONDS * 1000), String(MAX_RECORDS), String(RETENTION_SECONDS)]);
      if (!REPORT_ID_PATTERN.test(receipt)) throw new Error('field-report-capacity');
      return receipt;
    },
    async moderate(id: string, status: 'published' | 'rejected' | 'hidden', now = new Date()) {
      if (!REPORT_ID_PATTERN.test(id) || !['published', 'rejected', 'hidden'].includes(status)) return false;
      return (await redis.eval(MODERATE_REPORT_SCRIPT, [recordKey(id), `${prefix}:published`], [
        status,
        now.toISOString(),
        String(now.getTime()),
        String(RETENTION_SECONDS),
        String(now.getTime() - RETENTION_SECONDS * 1_000),
      ])) === 1;
    },
    async flag(id: string, reason: FieldReportFlagReason, now = new Date()) {
      if (!REPORT_ID_PATTERN.test(id)) return false;
      return (await redis.eval(FLAG_REPORT_SCRIPT, [recordKey(id)], [reason, now.toISOString()])) === 1;
    },
    async consumeRateLimit(kind: 'submit' | 'flag', ip: string, salt: string, now = new Date()) {
      const day = kstDate(now);
      const fingerprint = createHmac('sha256', salt).update(`${day}:${ip}`).digest('hex');
      return (await redis.eval(RATE_LIMIT_SCRIPT,
        [`${prefix}:rate:${day}:${kind}:${fingerprint}`, `${prefix}:rate:${day}:${kind}:total`],
        kind === 'submit' ? ['3', '50'] : ['10', '500'])) === 1;
    },
  };
}
