import { NextRequest, NextResponse } from 'next/server';
import { lt, sql } from 'drizzle-orm';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getMonthList, fetchTradeMonthAllPages, fetchRentMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { parseTradeXml, molitItemToTransaction } from '@/lib/molit-trade-parse';
import { parseRentXmlFull, molitItemToRentRow } from '@/lib/molit-rent-parse';
import { upsertTransactions } from '@/lib/tx-upsert';
import { upsertRentTransactions } from '@/lib/rent-tx-upsert';
import { getBlogDb } from '@/lib/db/client';
import { transactions, rentTransactions, type NewTransaction, type NewRentTransactionRow } from '@/lib/db/schema';

/**
 * 실거래 일일 증분 sync 크론 — Phase 2 (매매) + 전월세 확장 (2026-07-18).
 *
 * 전국 시군구 × 당월을 매일 재적재(멱등 upsert)해 지연신고·해제·갱신을
 * 자연 반영한다. 매매 먼저, 남은 예산으로 전월세 — Hobby 크론 2개 제한
 * 때문에 한 크론이 두 원장을 처리한다. 예산 초과로 스킵된 전월세 구는
 * 일별 시작점 로테이션(day-of-month offset)으로 다음 날 우선 처리된다.
 *
 * 보존: 매매 13개월 / 전월세 7개월 — 무료 512MB 상한 방어 (설계 근거:
 * 매매 221MB/12개월 + 전월세 다이어트 행 ~190MB/7개월 ≈ 총 480MB).
 * 인증: CRON_SECRET (fail-closed).
 */

export const maxDuration = 60;

const SYNC_MONTHS = 1;               // 당월 재적재 (과거는 백필 담당)
const CONCURRENCY = 8;
const TIME_BUDGET_MS = 55_000;       // maxDuration 60s 안전 마진
const TRADE_RETENTION_MONTHS = 13;   // 매매 — 최근 약 1년
const RENT_RETENTION_MONTHS = 7;     // 전월세 — 기본 조회 6개월 + 버퍼

function retentionCutoff(months: number): string {
  const cut = new Date();
  cut.setMonth(cut.getMonth() - months);
  return `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-01`;
}

interface PhaseResult { upserted: number; failed: number; skipped: number }

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[sync-transactions] CRON_SECRET 미설정 — fail-closed');
    return NextResponse.json(
      { error: 'Server misconfigured: CRON_SECRET missing' },
      { status: 500 },
    );
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    return NextResponse.json({ error: 'PUBLIC_DATA_API_KEY missing' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);

  const started = Date.now();
  const months = getMonthList(SYNC_MONTHS);
  const districts = Object.entries(DISTRICT_CODE); // [sigungu, lawdCd][]
  const db = getBlogDb();

  const deadline = () => Date.now() - started > TIME_BUDGET_MS;

  /** 공용 워커 풀 — startOffset 부터 wrap-around 순회 (스킵 공평 분산) */
  async function runPhase(
    startOffset: number,
    processJob: (sigungu: string, lawdCd: string, yyyymm: string) => Promise<number>,
  ): Promise<PhaseResult> {
    const jobs: Array<{ sigungu: string; lawdCd: string; yyyymm: string }> = [];
    for (let i = 0; i < districts.length; i++) {
      const [sigungu, lawdCd] = districts[(startOffset + i) % districts.length];
      for (const yyyymm of months) jobs.push({ sigungu, lawdCd, yyyymm });
    }

    const result: PhaseResult = { upserted: 0, failed: 0, skipped: 0 };
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        if (deadline()) {
          result.skipped = jobs.length - cursor;
          return;
        }
        const job = jobs[cursor++];
        try {
          result.upserted += await processJob(job.sigungu, job.lawdCd, job.yyyymm);
        } catch (e) {
          result.failed++;
          console.warn(
            `[sync-transactions] 실패 ${job.sigungu} ${job.yyyymm}:`,
            e instanceof Error ? e.message : e,
          );
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    return result;
  }

  // ── 매매 (항상 처음부터 — 주 데이터) ──
  const trade = await runPhase(0, async (sigungu, lawdCd, yyyymm) => {
    const xml = await fetchTradeMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm));
    const rows: NewTransaction[] = [];
    for (const item of parseTradeXml(xml)) {
      const row = molitItemToTransaction(item, { lawdCd, sigungu });
      if (row) rows.push(row);
    }
    return rows.length ? upsertTransactions(db, rows) : 0;
  });

  // ── 전월세 (남은 예산 — 일별 시작점 로테이션으로 스킵 구가 매일 바뀜) ──
  const rentOffset = new Date().getUTCDate() % districts.length;
  const rent = await runPhase(rentOffset, async (sigungu, lawdCd, yyyymm) => {
    const xml = await fetchRentMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm));
    const rows: NewRentTransactionRow[] = [];
    for (const item of parseRentXmlFull(xml)) {
      const row = molitItemToRentRow(item, { lawdCd, sigungu });
      if (row) rows.push(row);
    }
    return rows.length ? upsertRentTransactions(db, rows) : 0;
  });

  // ── 보존 정리 + 용량 모니터링 (fail-open) ──
  const purged = { trade: 0, rent: 0 };
  let dbMB: number | null = null;
  try {
    const t = await db.delete(transactions)
      .where(lt(transactions.dealDate, retentionCutoff(TRADE_RETENTION_MONTHS)));
    purged.trade = (t as { rowCount?: number }).rowCount ?? 0;
    const r = await db.delete(rentTransactions)
      .where(lt(rentTransactions.dealDate, retentionCutoff(RENT_RETENTION_MONTHS)));
    purged.rent = (r as { rowCount?: number }).rowCount ?? 0;
    const size = await db.execute(
      sql`SELECT round(pg_database_size(current_database()) / 1048576.0)::int AS mb`,
    );
    dbMB = (size as unknown as { rows?: Array<{ mb: number }> }).rows?.[0]?.mb ?? null;
  } catch (e) {
    console.warn('[sync-transactions] 보존 정리/용량 조회 실패 (fail-open):', e instanceof Error ? e.message : e);
  }

  const ms = Date.now() - started;
  console.log(
    `[sync-transactions] 완료 — trade(u=${trade.upserted} f=${trade.failed} s=${trade.skipped}) ` +
    `rent(u=${rent.upserted} f=${rent.failed} s=${rent.skipped}) ` +
    `purged(t=${purged.trade} r=${purged.rent}) db=${dbMB}MB ${ms}ms`,
  );
  return NextResponse.json({ trade, rent, purged, dbMB, ms });
}
