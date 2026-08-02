import { config } from 'dotenv';
config({ path: '/Users/bangjoohan/real-estate-service/.env.local' });
import os from 'node:os';

import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import * as schema from '../lib/db/schema';
import { type NewSilvTransactionRow } from '../lib/db/schema';
import { DISTRICT_CODE } from '../lib/district-codes';
import { getMonthList, fetchSilvMonthAllPages, revalidateForMonth } from '../lib/molit-months';
import { parseSilvXmlFull, molitItemToSilvRow } from '../lib/molit-silv-parse';
import { upsertSilvTransactions, type SilvTxDb } from '../lib/silv-tx-upsert';

/**
 * 분양권 원장 백필 — 1회 실행 (2026-08-02 원장 신설 초기 적재).
 * 최근 13개월(보존 기간)을 전 구에 대해 로컬+Neon 이중 적재.
 *
 *   실행: npx tsx scripts/backfill-silv.ts [--months=13]
 */

const MONTHS = parseInt(process.argv.find((a) => a.startsWith('--months='))?.slice(9) ?? '13', 10);
const CONCURRENCY = 8;
const LOCAL_DB_URL = process.env.NAEZIP_LOCAL_DB_URL ?? `postgresql://${os.userInfo().username}@localhost:5432/naezip`;

async function main() {
  const apiKey = decodeURIComponent(process.env.PUBLIC_DATA_API_KEY!);
  const pool = new Pool({ connectionString: LOCAL_DB_URL });
  const localDb = drizzlePg(pool, { schema });
  const neonDb = drizzleNeon(neon(process.env.DATABASE_URL!), { schema });

  const months = getMonthList(MONTHS);
  const districts = Object.entries(DISTRICT_CODE);
  const jobs: Array<{ sigungu: string; lawdCd: string; yyyymm: string }> = [];
  for (const [sigungu, lawdCd] of districts) {
    for (const yyyymm of months) jobs.push({ sigungu, lawdCd, yyyymm });
  }
  console.log(`[backfill-silv] ${months.length}개월 × ${districts.length}구 = ${jobs.length}잡`);

  let cursor = 0, localUp = 0, neonUp = 0, failed = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        const xml = await fetchSilvMonthAllPages(apiKey, job.lawdCd, job.yyyymm, revalidateForMonth(job.yyyymm));
        const rows: NewSilvTransactionRow[] = [];
        for (const item of parseSilvXmlFull(xml)) {
          const row = molitItemToSilvRow(item, { lawdCd: job.lawdCd, sigungu: job.sigungu });
          if (row) rows.push(row);
        }
        if (!rows.length) continue;
        const nl = await upsertSilvTransactions(localDb as unknown as SilvTxDb, rows);
        localUp += nl;
        const nn = await upsertSilvTransactions(neonDb as unknown as SilvTxDb, rows);
        neonUp += nn;
      } catch (e) {
        failed++;
        console.warn(`[backfill-silv] 실패 ${job.sigungu} ${job.yyyymm}:`, e instanceof Error ? e.message : e);
      }
      if (cursor % 200 === 0) console.log(`  진행 ${cursor}/${jobs.length} (local ${localUp})`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const cnt = await pool.query('SELECT count(*) c FROM silv_transactions');
  console.log(`[backfill-silv] 완료 — local u=${localUp} · neon u=${neonUp} · 실패 ${failed} · 로컬 총 ${cnt.rows[0].c}건`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
