import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../lib/db/schema';
import { DISTRICT_CODE } from '../lib/district-codes';
import { parseTradeXml, molitItemToTransaction } from '../lib/molit-trade-parse';
import { upsertTransactions } from '../lib/tx-upsert';
import type { NewTransaction } from '../lib/db/schema';

/**
 * 실거래 3년 백필 — Phase 2 (자체 DB 적재). 로컬 1회 실행.
 *
 * 전국 시군구(DISTRICT_CODE) × 최근 N개월 국토부 매매 실거래를 파싱해
 * transactions 테이블에 멱등 upsert 한다. dedupeKey 기반이라 중간에
 * 끊기거나 재실행해도 중복 없이 이어서 채운다.
 *
 * 실행:
 *   전체 3년:      npx tsx scripts/backfill-transactions.ts
 *   기간 지정:     npx tsx scripts/backfill-transactions.ts --months=12
 *   중단 후 재개:  npx tsx scripts/backfill-transactions.ts --from='강남구'
 *   드라이런:      npx tsx scripts/backfill-transactions.ts --months=1 --dry
 */

// ─────── 명명 상수 ───────
const TRADE_BASE_URL =
  'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const DEFAULT_MONTHS = 36;        // 3년
const MAX_PAGES = 3;              // 한 구·월 최대 3,000건 (molit-months 규칙과 동일)
const PER_PAGE = 1000;
const CONCURRENCY = 6;            // 국토부 동시 요청 (구 단위)
const RATE_LIMIT_DELAY_MS = 120;  // 국토부 부하 예의 (구 내 월별 fetch 간격)
const USER_AGENT = 'Mozilla/5.0 (compatible; naezip-backfill/1.0)';
const PROGRESS_EVERY = 20;        // N개 구마다 진행 로그

// ─────── 인자 파싱 ───────
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

/** 최근 n개월 'YYYYMM' (이번 달부터 과거로) */
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

/** 한 구·한 달 매매 XML 전체 페이지 (캐시 없이 fresh fetch) */
async function fetchTradeXml(apiKey: string, lawdCd: string, yyyymm: string): Promise<string> {
  const makeUrl = (pageNo: number) =>
    `${TRADE_BASE_URL}?serviceKey=${apiKey}` +
    `&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}&numOfRows=${PER_PAGE}&pageNo=${pageNo}`;

  const first = await fetch(makeUrl(1), { headers: { 'User-Agent': USER_AGENT } }).then((r) => r.text());
  const total = parseInt(first.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? '0', 10);
  if (total <= PER_PAGE) return first;

  const pages = Math.min(Math.ceil(total / PER_PAGE), MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      fetch(makeUrl(i + 2), { headers: { 'User-Agent': USER_AGENT } }).then((r) => r.text()),
    ),
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

  // 대상 구 목록 (--from 지정 시 그 구부터 재개)
  let districts = Object.entries(DISTRICT_CODE); // [sigungu, lawdCd][]
  if (from) {
    const idx = districts.findIndex(([name]) => name === from);
    if (idx >= 0) districts = districts.slice(idx);
    else console.warn(`[backfill] --from='${from}' 매칭 실패 — 전체 진행`);
  }

  console.log(
    `[backfill] 시작 — 구 ${districts.length}개 × ${months}개월 ` +
    `(${yyyymms[yyyymms.length - 1]}~${yyyymms[0]})${dry ? ' [DRY-RUN]' : ''}`,
  );

  let totalUpserted = 0;
  let totalFailed = 0;
  let doneDistricts = 0;
  const started = Date.now();

  // 구 단위 워커 풀 — 구 안에서는 월을 순차 fetch (국토부 부하 분산)
  let cursor = 0;
  async function worker() {
    while (cursor < districts.length) {
      const [sigungu, lawdCd] = districts[cursor++];
      const rows: NewTransaction[] = [];
      for (const yyyymm of yyyymms) {
        try {
          const xml = await fetchTradeXml(apiKey, lawdCd, yyyymm);
          for (const item of parseTradeXml(xml)) {
            const row = molitItemToTransaction(item, { lawdCd, sigungu });
            if (row) rows.push(row);
          }
        } catch (e) {
          totalFailed++;
          console.warn(`[backfill] fetch 실패 ${sigungu} ${yyyymm}:`, e instanceof Error ? e.message : e);
        }
        await sleep(RATE_LIMIT_DELAY_MS);
      }
      if (rows.length && !dry) totalUpserted += await upsertTransactions(db, rows);
      else if (dry) totalUpserted += rows.length;

      if (++doneDistricts % PROGRESS_EVERY === 0) {
        const sec = Math.round((Date.now() - started) / 1000);
        console.log(`[backfill] ${doneDistricts}/${districts.length}구 · 누적 ${totalUpserted} · ${sec}s`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const sec = Math.round((Date.now() - started) / 1000);
  console.log(
    `[backfill] 완료 — ${dry ? '파싱' : 'upsert'} ${totalUpserted}건 · 실패 ${totalFailed} · ` +
    `${districts.length}구 · ${sec}s${dry ? ' [DRY-RUN, DB 미기록]' : ''}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('[backfill] 치명적 오류:', e);
  process.exit(1);
});
