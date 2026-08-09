import { config } from 'dotenv';
config({ path: '/Users/bangjoohan/real-estate-service/.env.local' });
import os from 'node:os';

import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { Pool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { lt, sql } from 'drizzle-orm';
import * as schema from '../lib/db/schema';
import {
  transactions, rentTransactions, silvTransactions,
  type NewTransaction, type NewRentTransactionRow, type NewSilvTransactionRow,
} from '../lib/db/schema';
import { DISTRICT_CODE } from '../lib/district-codes';
import { getMonthList, fetchTradeMonthAllPages, fetchRentMonthAllPages, fetchSilvMonthAllPages, revalidateForMonth } from '../lib/molit-months';
import { parseTradeXml, molitItemToTransaction } from '../lib/molit-trade-parse';
import { parseRentXmlFull, molitItemToRentRow } from '../lib/molit-rent-parse';
import { parseSilvXmlFull, molitItemToSilvRow } from '../lib/molit-silv-parse';
import { upsertTransactions, type TxDb } from '../lib/tx-upsert';
import { upsertRentTransactions, type RentTxDb } from '../lib/rent-tx-upsert';
import { upsertSilvTransactions, type SilvTxDb } from '../lib/silv-tx-upsert';
import { getMacMiniSyncExitCode } from '../lib/macmini-sync-health';
import { isNeonQuotaError } from '../lib/neon-quota-error';

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
const SILV_RETENTION_MONTHS = 13;   // 분양권 — 거래량 미미, 매매와 동일 보존
// 사용자 명시 필수 — .env.local 의 Neon PGUSER/PGPASSWORD 가 빈 필드를 채우는 것 방지
const LOCAL_DB_URL = process.env.NAEZIP_LOCAL_DB_URL ?? `postgresql://${os.userInfo().username}@localhost:5432/naezip`;

function retentionCutoff(months: number): string {
  const cut = new Date();
  cut.setMonth(cut.getMonth() - months);
  return `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-01`;
}

interface PhaseResult {
  fetchFail: number;
  localUp: number;
  localFail: number;
  neonUp: number;
  neonFail: number;
  neonSkipped: number;
}

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
  const neonCircuit = { open: false };

  async function runNeonUpsert(
    label: string,
    rowCount: number,
    result: PhaseResult,
    upsert: () => Promise<number>,
  ): Promise<void> {
    if (neonCircuit.open) {
      result.neonSkipped += rowCount;
      return;
    }

    try {
      const count = await upsert();
      result.neonUp += count;
    } catch (error) {
      result.neonFail++;
      if (isNeonQuotaError(error)) {
        if (!neonCircuit.open) {
          neonCircuit.open = true;
          console.warn(
            `[macmini-sync] Neon 전송량 한도/HTTP 402 감지 (${label}) — 회로를 열고 남은 Neon upsert·cleanup을 건너뜁니다. 로컬 적재는 계속합니다.`,
          );
        }
        return;
      }

      console.warn(
        `[macmini-sync] Neon upsert 실패 ${label}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  async function runPhase(
    label: string,
    processJob: (sigungu: string, lawdCd: string, yyyymm: string, r: PhaseResult) => Promise<void>,
  ): Promise<PhaseResult> {
    const jobs: Array<{ sigungu: string; lawdCd: string; yyyymm: string }> = [];
    for (const [sigungu, lawdCd] of districts) {
      for (const yyyymm of months) jobs.push({ sigungu, lawdCd, yyyymm });
    }
    const r: PhaseResult = {
      fetchFail: 0,
      localUp: 0,
      localFail: 0,
      neonUp: 0,
      neonFail: 0,
      neonSkipped: 0,
    };
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
    await runNeonUpsert(
      `trade ${sigungu} ${yyyymm}`,
      rows.length,
      r,
      () => upsertTransactions(neonDb as unknown as TxDb, rows),
    );
  });
  console.log(`[${ts()}] trade — local u=${trade.localUp} f=${trade.localFail} · neon u=${trade.neonUp} f=${trade.neonFail} skipped=${trade.neonSkipped} · fetch f=${trade.fetchFail}`);

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
    await runNeonUpsert(
      `rent ${sigungu} ${yyyymm}`,
      rows.length,
      r,
      () => upsertRentTransactions(neonDb as unknown as RentTxDb, rows),
    );
  });
  console.log(`[${ts()}] rent — local u=${rent.localUp} f=${rent.localFail} · neon u=${rent.neonUp} f=${rent.neonFail} skipped=${rent.neonSkipped} · fetch f=${rent.fetchFail}`);

  // ── 분양권 (2026-08-02 원장 신설 — 유형 탭 시/도 집계용) ──
  const silv = await runPhase('silv', async (sigungu, lawdCd, yyyymm, r) => {
    const xml = await fetchSilvMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm));
    const rows: NewSilvTransactionRow[] = [];
    for (const item of parseSilvXmlFull(xml)) {
      const row = molitItemToSilvRow(item, { lawdCd, sigungu });
      if (row) rows.push(row);
    }
    if (!rows.length) return;
    try { const n = await upsertSilvTransactions(localDb as unknown as SilvTxDb, rows); r.localUp += n; }
    catch (e) { r.localFail++; console.warn(`[macmini-sync] 로컬 silv upsert 실패 ${sigungu} ${yyyymm}:`, e instanceof Error ? e.message : e); }
    await runNeonUpsert(
      `silv ${sigungu} ${yyyymm}`,
      rows.length,
      r,
      () => upsertSilvTransactions(neonDb as unknown as SilvTxDb, rows),
    );
  });
  console.log(`[${ts()}] silv — local u=${silv.localUp} f=${silv.localFail} · neon u=${silv.neonUp} f=${silv.neonFail} skipped=${silv.neonSkipped} · fetch f=${silv.fetchFail}`);

  // ── Neon 보존 정리 + 용량 (fail-open) — 로컬은 무제한 보존 ──
  if (neonCircuit.open) {
    console.warn(`[${ts()}] neon purge/size — skipped (quota circuit open)`);
  } else {
    try {
      const t = await neonDb.delete(transactions).where(lt(transactions.dealDate, retentionCutoff(TRADE_RETENTION_MONTHS)));
      const rr = await neonDb.delete(rentTransactions).where(lt(rentTransactions.dealDate, retentionCutoff(RENT_RETENTION_MONTHS)));
      await neonDb.delete(silvTransactions).where(lt(silvTransactions.dealDate, retentionCutoff(SILV_RETENTION_MONTHS)));
      const size = await neonDb.execute(sql`SELECT round(pg_database_size(current_database()) / 1048576.0)::int AS mb`);
      const dbMB = (size as unknown as { rows?: Array<{ mb: number }> }).rows?.[0]?.mb ?? null;
      console.log(`[${ts()}] neon purge t=${(t as { rowCount?: number }).rowCount ?? 0} r=${(rr as { rowCount?: number }).rowCount ?? 0} · neon db=${dbMB}MB`);
    } catch (e) {
      if (isNeonQuotaError(e)) {
        neonCircuit.open = true;
        console.warn('[macmini-sync] Neon 보존 정리 중 전송량 한도/HTTP 402 감지 — 용량 조회를 중단합니다.');
      } else {
        console.warn('[macmini-sync] Neon 보존 정리/용량 조회 실패 (fail-open):', e instanceof Error ? e.message : e);
      }
    }
  }

  const localCnt = await pool.query(
    `SELECT (SELECT count(*) FROM transactions) t, (SELECT count(*) FROM rent_transactions) r`,
  );
  console.log(`[${ts()}] 로컬 원장 — 매매 ${localCnt.rows[0].t} · 전월세 ${localCnt.rows[0].r}`);
  await pool.end();

  const failTotal = trade.fetchFail + trade.localFail + rent.fetchFail + rent.localFail + silv.fetchFail + silv.localFail;
  const neonFailTotal = trade.neonFail + rent.neonFail + silv.neonFail;
  const neonSkippedTotal = trade.neonSkipped + rent.neonSkipped + silv.neonSkipped;
  const exitCode = getMacMiniSyncExitCode({
    localFailureCount: failTotal,
    neonFailureCount: neonFailTotal,
    neonCircuitOpen: neonCircuit.open,
  });
  const status = exitCode === 0 ? 'HEALTHY' : exitCode === 2 ? 'DEGRADED' : 'FAILED';
  console.log(
    `[${ts()}] status=${status} · Neon circuit=${neonCircuit.open ? 'OPEN' : 'CLOSED'} failures=${neonFailTotal} skipped=${neonSkippedTotal} rows · exit=${exitCode}`,
  );
  console.log(`[${ts()}] ── 완료 (${Math.round((Date.now() - started) / 1000)}s) ──`);
  // 2는 로컬 원장은 보존됐지만 Neon 서빙 캐시 동기화가 저하된 상태다.
  process.exit(exitCode);
}

main().catch((e) => { console.error('[macmini-sync] 치명 오류:', e); process.exit(1); });
