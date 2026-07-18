import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../lib/db/schema';
import { DISTRICT_CODE } from '../lib/district-codes';
import { fetchMolitXml } from '../lib/molit-fetch';
import { parseRentXmlFull, molitItemToRentRow } from '../lib/molit-rent-parse';
import { upsertRentTransactions } from '../lib/rent-tx-upsert';
import type { NewRentTransactionRow } from '../lib/db/schema';

/**
 * 전월세 백필 — 전월세 DB 적재 (2026-07-18). 로컬 1회 실행.
 *
 * 매매 백필(backfill-transactions.ts)과 동일 구조. 전국 시군구 × 최근
 * N개월(기본 6 — 보존 7개월 설계에 맞춤) 전월세를 rent_transactions 에
 * 멱등 upsert. 중간에 끊겨도 재실행하면 이어서 채운다.
 *
 * 실행:
 *   기본 6개월:    npx tsx scripts/backfill-rent-transactions.ts
 *   기간 지정:     npx tsx scripts/backfill-rent-transactions.ts --months=3
 *   중단 후 재개:  npx tsx scripts/backfill-rent-transactions.ts --from='강남구'
 *   드라이런:      npx tsx scripts/backfill-rent-transactions.ts --months=1 --dry
 */

// ─────── 명명 상수 ───────
const RENT_BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
const DEFAULT_MONTHS = 6;         // 보존 7개월 설계 (기본 조회 6개월 + 버퍼)
const MAX_PAGES = 3;              // 한 구·월 최대 3,000건 (molit-months 규칙과 동일)
const PER_PAGE = 1000;
const CONCURRENCY = 6;
const RATE_LIMIT_DELAY_MS = 120;
const PROGRESS_EVERY = 20;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const hit = args.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(hit.indexOf('=') + 1) : undefined;
  };
  return {
    months: Math.max(parseInt(get('months') ?? String(DEFAULT_MONTHS), 10) || DEFAULT_MONTHS, 1),
    from: get('from'),
    dry: args.includes('--dry'),
  };
}

function monthList(months: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 한 구·한 달 전월세 XML 전체 페이지 — 소프트 에러는 throw (조용한 누락 방지) */
async function fetchRentXml(apiKey: string, lawdCd: string, yyyymm: string): Promise<string> {
  const makeUrl = (pageNo: number) =>
    `${RENT_BASE_URL}?serviceKey=${apiKey}` +
    `&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}&numOfRows=${PER_PAGE}&pageNo=${pageNo}`;

  const first = await fetchMolitXml(makeUrl(1), 0);
  if (!first.includes('<totalCount>')) {
    throw new Error(`국토부 소프트 에러(totalCount 없음) — ${lawdCd} ${yyyymm}`);
  }
  const total = parseInt(first.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? '0', 10);
  if (total <= PER_PAGE) return first;

  const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) => fetchMolitXml(makeUrl(i + 2), 0)),
  );
  return [first, ...rest].join('\n');
}

async function main() {
  const { months, from, dry } = parseArgs();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL 환경변수 미설정 (.env.local 확인)');
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) throw new Error('PUBLIC_DATA_API_KEY 환경변수 미설정');
  const apiKey = decodeURIComponent(rawKey);

  const db = drizzle(neon(dbUrl), { schema });
  const yyyymms = monthList(months);

  let districts = Object.entries(DISTRICT_CODE);
  if (from) {
    const idx = districts.findIndex(([name]) => name === from);
    if (idx >= 0) districts = districts.slice(idx);
    else console.warn(`[rent-backfill] --from='${from}' 매칭 실패 — 전체 진행`);
  }

  console.log(
    `[rent-backfill] 시작 — 구 ${districts.length}개 × ${months}개월 ` +
    `(${yyyymms[yyyymms.length - 1]}~${yyyymms[0]})${dry ? ' [DRY-RUN]' : ''}`,
  );

  let totalUpserted = 0;
  let totalFailed = 0;
  let doneDistricts = 0;
  const started = Date.now();

  let cursor = 0;
  async function worker() {
    while (cursor < districts.length) {
      const [sigungu, lawdCd] = districts[cursor++];
      const rows: NewRentTransactionRow[] = [];
      for (const yyyymm of yyyymms) {
        try {
          const xml = await fetchRentXml(apiKey, lawdCd, yyyymm);
          for (const item of parseRentXmlFull(xml)) {
            const row = molitItemToRentRow(item, { lawdCd, sigungu });
            if (row) rows.push(row);
          }
        } catch (e) {
          totalFailed++;
          console.warn(`[rent-backfill] fetch 실패 ${sigungu} ${yyyymm}:`, e instanceof Error ? e.message : e);
        }
        await sleep(RATE_LIMIT_DELAY_MS);
      }
      if (rows.length && !dry) {
        // `x += await f()` 레이스 방지 — await 후 가산 (backfill-transactions 와 동일 픽스)
        const upserted = await upsertRentTransactions(db, rows);
        totalUpserted += upserted;
      } else if (dry) {
        totalUpserted += rows.length;
      }

      if (++doneDistricts % PROGRESS_EVERY === 0) {
        const sec = Math.round((Date.now() - started) / 1000);
        console.log(`[rent-backfill] ${doneDistricts}/${districts.length}구 · 누적 ${totalUpserted} · ${sec}s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const sec = Math.round((Date.now() - started) / 1000);
  console.log(
    `[rent-backfill] 완료 — ${dry ? '파싱' : 'upsert'} ${totalUpserted}건 · 실패 ${totalFailed} · ` +
    `${districts.length}구 · ${sec}s${dry ? ' [DRY-RUN, DB 미기록]' : ''}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('[rent-backfill] 치명적 오류:', e);
  process.exit(1);
});
