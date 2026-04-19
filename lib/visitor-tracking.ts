/**
 * 방문자 트래킹 — Phase 5d-1
 *
 * 전략:
 * - sha256(IP + UA + SALT) 지문으로 익명화 (IP 원본 저장 안 함)
 * - 봇 UA 패턴 필터링 (표시광고법 준수)
 * - 관리자 IP 제외 (숫자 오염 방지)
 * - Redis 3키 관리: 오늘 Set, 24h Sorted Set, 누적 Counter
 */

import { createHash } from 'node:crypto';
import { cacheLife } from 'next/cache';
import { redis } from './redis';

const BOT_UA_PATTERN =
  /bot|crawler|spider|googlebot|bingbot|yandexbot|baidu|duckduckbot|slurp|facebookexternalhit|twitterbot/i;

const getSalt = (): string => {
  const salt = process.env.VISITOR_FINGERPRINT_SALT;
  if (!salt) throw new Error('VISITOR_FINGERPRINT_SALT not set');
  return salt;
};

const getAdminIps = (): Set<string> => {
  const raw = process.env.ADMIN_IP_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
};

/** 봇 또는 관리자 판정 */
export function isExcluded(ip: string, ua: string): boolean {
  if (!ua || BOT_UA_PATTERN.test(ua)) return true;
  if (getAdminIps().has(ip)) return true;
  return false;
}

/** 방문자 지문 생성 — IP/UA/SALT 해시, 16자 절단 */
export function fingerprint(ip: string, ua: string): string {
  return createHash('sha256')
    .update(`${ip}::${ua}::${getSalt()}`)
    .digest('hex')
    .slice(0, 16);
}

/** 방문 트래킹 — 페이지 진입 시 호출 */
export async function trackVisit(ip: string, ua: string): Promise<void> {
  if (isExcluded(ip, ua)) return;

  const fp = fingerprint(ip, ua);
  const today = getKstDateString(new Date());
  const now = Date.now();
  const dayEndMs = getKstEndOfDayMs(new Date());

  // 신규 방문자 판정 (all_time_seen Set에 이미 있으면 0 반환)
  const isNewAllTime = await redis.sadd('visitors:all_time_seen', fp);

  await Promise.all([
    // 오늘 방문자 Set
    redis.sadd(`visitors:day:${today}`, fp),
    redis.expireat(`visitors:day:${today}`, Math.floor(dayEndMs / 1000)),
    // 24시간 활성 Sorted Set
    redis.zadd('visitors:active24h', { score: now, member: fp }),
    redis.zremrangebyscore('visitors:active24h', 0, now - 24 * 3600 * 1000),
    // 누적 고유 방문자 — 신규일 때만 INCR
    ...(isNewAllTime === 1 ? [redis.incr('visitors:total_unique')] : []),
  ]);
}

/** 현재 3개 지표 조회 */
export interface VisitorStatsData {
  today: number;
  active24h: number;
  total: number;
}

export async function getStats(): Promise<VisitorStatsData> {
  'use cache';
  cacheLife('seconds');

  try {
    const today = getKstDateString(new Date());
    const [todayCount, active24hCount, totalUnique] = await Promise.all([
      redis.scard(`visitors:day:${today}`),
      redis.zcard('visitors:active24h'),
      redis.get<number>('visitors:total_unique'),
    ]);

    return {
      today: Number(todayCount ?? 0),
      active24h: Number(active24hCount ?? 0),
      total: Number(totalUnique ?? 0),
    };
  } catch (err) {
    console.error('[visitor-tracking] getStats failed:', err);
    return { today: 0, active24h: 0, total: 0 };
  }
}

// --- KST 유틸 ---

function getKstDateString(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function getKstEndOfDayMs(d: Date): number {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  kst.setUTCHours(23, 59, 59, 999);
  return kst.getTime() - 9 * 3600 * 1000;
}
