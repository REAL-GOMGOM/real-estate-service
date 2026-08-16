import { describe, expect, it } from 'vitest';
import {
  VISITOR_DAILY_RETENTION_DAYS,
  createVisitorFingerprint,
  getVisitorSummary,
  isAdminIp,
  isObviousBot,
  recordVisitor,
  visitorDayKey,
  type VisitorAggregateStore,
} from '../visitor-analytics';

const configuredEnv = {
  VERCEL_ENV: 'production',
  VISITOR_FINGERPRINT_SALT: 's'.repeat(32),
  UPSTASH_REDIS_REST_KV_REST_API_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_KV_REST_API_TOKEN: 'test-token',
};

describe('visitor analytics aggregates', () => {
  it('IP를 원문이 드러나지 않는 HMAC-SHA256 값으로 바꾼다', () => {
    const fingerprint = createVisitorFingerprint(
      '203.0.113.7',
      configuredEnv.VISITOR_FINGERPRINT_SALT,
    );

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprint).not.toContain('203.0.113.7');
  });

  it('Preview와 로컬 실행은 운영 방문 집계에 기록하지 않는다', async () => {
    let writes = 0;
    const store: VisitorAggregateStore = {
      async add() { writes += 1; },
      async read() { return { today: 0, last7Days: 0, total: 0 }; },
    };

    await expect(recordVisitor({
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 Chrome/140.0',
      env: { ...configuredEnv, VERCEL_ENV: 'preview' },
      store,
    })).resolves.toBe('ignored');
    expect(writes).toBe(0);
  });

  it('리포트용 KV만 있을 때 방문자 저장소로 폴백하지 않는다', async () => {
    const summary = await getVisitorSummary({
      env: {
        VISITOR_FINGERPRINT_SALT: 's'.repeat(32),
        KV_REST_API_URL: 'https://report-kv.example',
        KV_REST_API_TOKEN: 'report-token',
      },
    });

    expect(summary).toMatchObject({ status: 'unavailable', reason: 'not-configured' });
  });

  it('명백한 봇과 관리자 허용목록 IP를 제외한다', () => {
    expect(isObviousBot('Googlebot/2.1')).toBe(true);
    expect(isObviousBot('Mozilla/5.0 Chrome/140.0 Safari/537.36')).toBe(false);
    expect(isAdminIp('203.0.113.7', '198.51.100.2, 203.0.113.7')).toBe(true);
    expect(isAdminIp('203.0.113.8', '198.51.100.2, 203.0.113.7')).toBe(false);
  });

  it('일별·누적 HyperLogLog에 해시만 쓰고 일별 키를 35일 뒤 만료한다', async () => {
    let write: Parameters<VisitorAggregateStore['add']>[0] | null = null;
    const store: VisitorAggregateStore = {
      async add(input) { write = input; },
      async read() { return { today: 0, last7Days: 0, total: 0 }; },
    };
    const now = new Date('2026-08-16T03:00:00.000Z');

    await expect(recordVisitor({
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 Chrome/140.0',
      now,
      env: configuredEnv,
      store,
    })).resolves.toBe('recorded');

    expect(write).not.toBeNull();
    expect(write!.dailyKey).toBe('naezip:visitors:v1:day:2026-08-16');
    expect(write!.lifetimeKey).toBe('naezip:visitors:v1:lifetime');
    expect(write!.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(write!.fingerprint).not.toContain('203.0.113.7');
    const kstDayStart = Date.parse('2026-08-16T00:00:00+09:00') / 1_000;
    expect(write!.expiresAtUnix).toBe(kstDayStart + VISITOR_DAILY_RETENTION_DAYS * 86_400);
  });

  it('한국 날짜 기준 오늘·최근 7일·누적 고유값을 엄격한 공개 계약으로 반환한다', async () => {
    let read: Parameters<VisitorAggregateStore['read']>[0] | null = null;
    const store: VisitorAggregateStore = {
      async add() {},
      async read(input) {
        read = input;
        return { today: 12, last7Days: 45, total: 789 };
      },
    };
    const now = new Date('2026-08-16T15:30:00.000Z');
    const summary = await getVisitorSummary({ now, env: configuredEnv, store });

    expect(summary).toEqual({
      schema: 'naezip.visitor-summary.v1',
      status: 'available',
      scope: 'analytics-consent',
      approximate: true,
      today: 12,
      last7Days: 45,
      total: 789,
      updatedAt: now.toISOString(),
      reason: null,
    });
    expect(read!.todayKey).toBe(visitorDayKey(now));
    expect(read!.last7DayKeys).toHaveLength(7);
    expect(read!.last7DayKeys.at(-1)).toBe('naezip:visitors:v1:day:2026-08-11');
  });

  it('설정 누락이나 저장소 오류를 0명으로 위장하지 않는다', async () => {
    const store: VisitorAggregateStore = {
      async add() {},
      async read() { throw new Error('redis unavailable'); },
    };

    const missing = await getVisitorSummary({ env: {}, store });
    expect(missing).toMatchObject({
      status: 'unavailable',
      today: null,
      last7Days: null,
      total: null,
      reason: 'not-configured',
    });

    const failed = await getVisitorSummary({ env: configuredEnv, store });
    expect(failed).toMatchObject({
      status: 'unavailable',
      today: null,
      last7Days: null,
      total: null,
      reason: 'store-unavailable',
    });
  });
});
