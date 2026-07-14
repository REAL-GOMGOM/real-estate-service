import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { getMonthList, fetchTradeMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { parseTradeXml, molitItemToTransaction } from '@/lib/molit-trade-parse';
import { upsertTransactions } from '@/lib/tx-upsert';
import { getBlogDb } from '@/lib/db/client';
import type { NewTransaction } from '@/lib/db/schema';

/**
 * 실거래 일일 증분 sync 크론 — Phase 2 (자체 DB 적재, 2026-07-14).
 *
 * 전국 시군구 × 당월 매매 실거래를 국토부에서 받아 transactions 테이블에
 * 멱등 upsert. 당월을 매일 재적재하므로 지연신고·해제(취소)가 자연 반영된다.
 * 과거분은 scripts/backfill-transactions.ts(1회)가 담당.
 *
 * 인증: CRON_SECRET (fail-closed) — warm-transactions/generate-report 동일 패턴.
 * 참고: DB 조회 전환(Phase 2 커밋3) 후 warm-transactions 크론을 이 크론으로
 *       교체(vercel.json)해 Hobby 크론 슬롯 순증을 0으로 둔다.
 */

export const maxDuration = 60;

const SYNC_MONTHS = 1;         // 당월 재적재 (과거는 백필 담당)
const CONCURRENCY = 8;         // 국토부 동시 요청 (warm 실측 기반, 60s 예산 내 238구 흡수)
const TIME_BUDGET_MS = 55_000; // maxDuration 60s 안전 마진 — 초과분은 다음 실행에서 이어짐

export async function GET(req: NextRequest) {
  // CRON_SECRET 인증 (fail-closed: 미설정 시 호출 거부)
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

  const jobs: Array<{ sigungu: string; lawdCd: string; yyyymm: string }> = [];
  for (const [sigungu, lawdCd] of districts) {
    for (const yyyymm of months) jobs.push({ sigungu, lawdCd, yyyymm });
  }

  const db = getBlogDb();
  let upserted = 0;
  let failed = 0;
  let skipped = 0;

  // 동시성 제한 워커 풀 — 시간 예산 초과 시 남은 작업은 다음 실행으로
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        skipped = jobs.length - cursor;
        return;
      }
      const job = jobs[cursor++];
      try {
        const xml = await fetchTradeMonthAllPages(
          apiKey, job.lawdCd, job.yyyymm, revalidateForMonth(job.yyyymm),
        );
        const rows: NewTransaction[] = [];
        for (const item of parseTradeXml(xml)) {
          const row = molitItemToTransaction(item, { lawdCd: job.lawdCd, sigungu: job.sigungu });
          if (row) rows.push(row);
        }
        if (rows.length) upserted += await upsertTransactions(db, rows);
      } catch (e) {
        failed++;
        console.warn(
          `[sync-transactions] 실패 ${job.sigungu} ${job.yyyymm}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const ms = Date.now() - started;
  console.log(
    `[sync-transactions] 완료 — upserted=${upserted} failed=${failed} skipped=${skipped} ${ms}ms`,
  );
  return NextResponse.json({ upserted, failed, skipped, totalJobs: jobs.length, ms });
}
