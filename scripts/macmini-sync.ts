import { config } from 'dotenv';
config({ path: '/Users/bangjoohan/real-estate-service/.env.local' });
import os from 'node:os';

import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { lt, sql } from 'drizzle-orm';
import * as schema from '../lib/db/schema';
import { transactions, rentTransactions, type NewTransaction, type NewRentTransactionRow } from '../lib/db/schema';
import { DISTRICT_CODE } from '../lib/district-codes';
import { getMonthList, fetchTradeMonthAllPages, fetchRentMonthAllPages, revalidateForMonth } from '../lib/molit-months';
import { parseTradeXml, molitItemToTransaction } from '../lib/molit-trade-parse';
import { parseRentXmlFull, molitItemToRentRow } from '../lib/molit-rent-parse';
import { upsertTransactions, type TxDb } from '../lib/tx-upsert';
import { upsertRentTransactions, type RentTxDb } from '../lib/rent-tx-upsert';

/**
 * 실거래 일일 sync — 맥미니 이전판 (2026-08-02, Neon 의존도 완화 2단계).
 *
 * Vercel 크론(app/api/cron/sync-transactions)을 대체한다. 같은 수집·upsert
 * 로직이되 서버리스 제약이 없어:
 *   - 시간 예산(55s)·스킵 로테이션 불필요 — 매일 전 구·전월분 완주
 *   - 로컬(naezip, 전체 이력 보존) + Neon(서빙 캐시) 이중 적재
 *   - Neon 장애(402 등) 시에도 로컬 적재는 계속 — 복구 후 upsert 로 수렴
 * 보존 정리는 Neon 만 (매매 13개월/전월세 7개월, 기존과 동일). 로컬 무제한.
 *
 *   수동 실행:  npx tsx scripts/macmini-sync.ts
 *   정기 실행:  launchd com.gomgom.naezip-sync (매일 05:00 KST)
 */

const SYNC_MONTHS = 2;
const CONCURRENCY = 8;
const TRADE_RETENTION_MONTHS = 13;
const RENT_RETENTION_MONTHS = 7;
// 사용자 명시 필수 — .env.local 의 Neon PGUSER/PGPASSWORD 가 빈 필드를 채우는 것 방지
const LOCAL_DB_URL = process.env.NAEZIP_LOCAL_DB_URL ?? `postgresql://${os.userInfo().username}@localhost:5432/naezip`;

function retentionCutoff(months: number): string {
  const cut = new Date();
  cut.setMonth(cut.getMonth() - months);
  return `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-01`;
}

interface PhaseResult { fetchFail: number; localUp: number; localFail: number; neonUp: number; neonFail: number }

async function main() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) throw new Error('PUBLIC_DATA_API_KEY 미설정');
  const apiKey = decodeURIComponent(rawKey);

  const pool = new Pool({ connectionString: LOCAL_DB_URL });
  const localDb = drizzlePg(pool, { schema });
  const neonDb = drizzleNeon(neon(process.env.DATABASE_URL!), { schema });

  const started = Date.now();
  const months = getMonthList(SYNC_MONTHS);
  const districts = Object.entries(DISTRICT_CODE);
  const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  async function runPhase(
    label: string,
    processJob: (sigungu: string, lawdCd: string, yyyymm: string, r: PhaseResult) => Promise<void>,
  ): Promise<PhaseResult> {
    const jobs: Array<{ sigungu: string; lawdCd: string; yyyymm: string }> = [];
    for (const [sigungu, lawdCd] of districts) {
      for (const yyyymm of months) jobs.push({ sigungu, lawdCd, yyyymm });
    }
    const r: PhaseResult = { fetchFail: 0, localUp: 0, localFail: 0, neonUp: 0, neonFail: 0 };
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          await processJob(job.sigungu, job.lawdCd, job.yyyymm, r);
        } catch (e) {
          r.fetchFail++;
          console.warn(`[macmini-sync] ${label} 수집 실패 ${job.sigungu} ${job.yyyymm}:`, e instanceof Error ? e.message : e);
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return r;
  }

  console.log(`[${ts()}] ── macmini-sync 시작 (months=${months.join(',')}, 구 ${districts.length}개) ──`);

  // ── 매매 ──
  const trade = await runPhase('trade', async (sigungu, lawdCd, yyyymm, r) => {
    const xml = await fetchTradeMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm));
    const rows: NewTransaction[] = [];
    for (const item of parseTradeXml(xml)) {
      const row = molitItemToTransaction(item, { lawdCd, sigungu });
      if (row) rows.push(row);
    }
    if (!rows.length) return;
    // `x += await f()` 는 좌변을 await 전에 읽어 동시 워커 가산을 덮어씀 — await 후 가산
    try { const n = await upsertTransactions(localDb as unknown as TxDb, rows); r.localUp += n; }
    catch (e) { r.localFail++; console.warn(`[macmini-sync] 로컬 upsert 실패 ${sigungu} ${yyyymm}:`, e instanceof Error ? e.message : e); }
    try { const n = await upsertTransactions(neonDb as unknown as TxDb, rows); r.neonUp += n; }
    catch (e) { r.neonFail++; console.warn(`[macmini-sync] Neon upsert 실패 ${sigungu} ${yyyymm}:`, e instanceof Error ? e.message : e); }
  });
  console.log(`[${ts()}] trade — local u=${trade.localUp} f=${trade.localFail} · neon u=${trade.neonUp} f=${trade.neonFail} · fetch f=${trade.fetchFail}`);

  // ── 전월세 ──
  const rent = await runPhase('rent', async (sigungu, lawdCd, yyyymm, r) => {
    const xml = await fetchRentMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm));
    const rows: NewRentTransactionRow[] = [];
    for (const item of parseRentXmlFull(xml)) {
      const row = molitItemToRentRow(item, { lawdCd, sigungu });
      if (row) rows.push(row);
    }
    if (!rows.length) return;
    try { const n = await upsertRentTransactions(localDb as unknown as RentTxDb, rows); r.localUp += n; }
    catch (e) { r.localFail++; console.warn(`[macmini-sync] 로컬 rent upsert 실패 ${sigungu} ${yyyymm}:`, e instanceof Error ? e.message : e); }
    try { const n = await upsertRentTransactions(neonDb as unknown as RentTxDb, rows); r.neonUp += n; }
    catch (e) { r.neonFail++; console.warn(`[macmini-sync] Neon rent upsert 실패 ${sigungu} ${yyyymm}:`, e instanceof Error ? e.message : e); }
  });
  console.log(`[${ts()}] rent — local u=${rent.localUp} f=${rent.localFail} · neon u=${rent.neonUp} f=${rent.neonFail} · fetch f=${rent.fetchFail}`);

  // ── Neon 보존 정리 + 용량 (fail-open) — 로컬은 무제한 보존 ──
  try {
    const t = await neonDb.delete(transactions).where(lt(transactions.dealDate, retentionCutoff(TRADE_RETENTION_MONTHS)));
    const rr = await neonDb.delete(rentTransactions).where(lt(rentTransactions.dealDate, retentionCutoff(RENT_RETENTION_MONTHS)));
    const size = await neonDb.execute(sql`SELECT round(pg_database_size(current_database()) / 1048576.0)::int AS mb`);
    const dbMB = (size as unknown as { rows?: Array<{ mb: number }> }).rows?.[0]?.mb ?? null;
    console.log(`[${ts()}] neon purge t=${(t as { rowCount?: number }).rowCount ?? 0} r=${(rr as { rowCount?: number }).rowCount ?? 0} · neon db=${dbMB}MB`);
  } catch (e) {
    console.warn('[macmini-sync] Neon 보존 정리/용량 조회 실패 (fail-open):', e instanceof Error ? e.message : e);
  }

  const localCnt = await pool.query(
    `SELECT (SELECT count(*) FROM transactions) t, (SELECT count(*) FROM rent_transactions) r`,
  );
  console.log(`[${ts()}] 로컬 원장 — 매매 ${localCnt.rows[0].t} · 전월세 ${localCnt.rows[0].r}`);
  await pool.end();

  const failTotal = trade.fetchFail + trade.localFail + rent.fetchFail + rent.localFail;
  console.log(`[${ts()}] ── 완료 (${Math.round((Date.now() - started) / 1000)}s) ──`);
  // Neon 실패는 다음 날 upsert 로 수렴하므로 종료코드에 반영하지 않음 (로컬·수집 실패만)
  process.exit(failTotal > 0 ? 1 : 0);
}

main().catch((e) => { console.error('[macmini-sync] 치명 오류:', e); process.exit(1); });
