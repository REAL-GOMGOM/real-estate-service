import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, ilike, sql } from 'drizzle-orm';
import { apartments } from '../lib/db/schema';

/**
 * 사이클 J — 세종 backfill 검증.
 * 읽기 전용. 값 비교만.
 */

const EXPECTED_TOTAL  = 22147;
const EXPECTED_SEJONG = 216;
const SENTINEL_VALUE  = '세종';
const SEJONG_SIDO     = '세종특별자치시';
const BACKUP_TABLE    = 'apartments_backup_cycle_j';

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('[verify] DATABASE_URL 미설정');
    process.exit(1);
  }
  const raw = neon(url);
  const db = drizzle(raw);

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  // 1. 총 COUNT
  const total = await db.select({ c: sql<number>`count(*)::int` }).from(apartments);
  checks.push({
    name:  'total count',
    ok:    total[0].c === EXPECTED_TOTAL,
    detail: `actual ${total[0].c}, expected ${EXPECTED_TOTAL}`,
  });

  // 2. 세종 sido COUNT
  const sejong = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(apartments)
    .where(eq(apartments.sido, SEJONG_SIDO));
  checks.push({
    name:  'sejong sido count',
    ok:    sejong[0].c === EXPECTED_SEJONG,
    detail: `actual ${sejong[0].c}, expected ${EXPECTED_SEJONG}`,
  });

  // 3. sentinel sigungu COUNT
  const sentinel = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(apartments)
    .where(eq(apartments.sigungu, SENTINEL_VALUE));
  checks.push({
    name:  `sigungu='${SENTINEL_VALUE}' count`,
    ok:    sentinel[0].c === EXPECTED_SEJONG,
    detail: `actual ${sentinel[0].c}, expected ${EXPECTED_SEJONG}`,
  });

  // 4. 기존 21,931건 무영향 (backup join 비교)
  // BACKUP_TABLE은 코드 상수라 인젝션 위험 없음
  const diffQ = `
    SELECT COUNT(*)::int AS c
    FROM apartments a
    JOIN ${BACKUP_TABLE} b ON a.id = b.id
    WHERE a.name <> b.name
       OR a.sigungu <> b.sigungu
       OR a.lawd_cd <> b.lawd_cd
       OR a.sido <> b.sido
  `;
  const diff = await raw.query(diffQ) as Array<{ c: number }>;
  checks.push({
    name:   'existing 21,931 rows unchanged (backup join)',
    ok:     diff[0].c === 0,
    detail: `${diff[0].c} rows differ`,
  });

  // 5. 세종 핵심 단지 spot check (2건 — 사이클 I 진단 sample 활용)
  const SEJONG_SPOT = ['수루배마을', '세종 펠리스'];
  const spot: Array<{ q: string; n: number }> = [];
  for (const q of SEJONG_SPOT) {
    const r = await db
      .select({ id: apartments.id, name: apartments.name })
      .from(apartments)
      .where(ilike(apartments.name, `%${q}%`));
    spot.push({ q, n: r.length });
  }
  checks.push({
    name:   'sejong key apartments findable',
    ok:     spot.every((s) => s.n > 0),
    detail: spot.map((s) => `${s.q}=${s.n}`).join(', '),
  });

  // 결과 출력
  console.log('='.repeat(60));
  console.log('세종 backfill 검증');
  console.log('='.repeat(60));
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`);
  }
  const allOk = checks.every((c) => c.ok);
  console.log('='.repeat(60));
  console.log(allOk ? '✓ ALL PASS' : '✗ FAIL');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error('[verify] 실패:', e);
  process.exit(1);
});
