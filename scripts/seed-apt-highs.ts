/**
 * apt_highs 시드 — 사이클 FF (역대 전고점 1회 적재)
 *
 * 지정 권역의 전 시군구 × 2019.01~현재 MOLIT 매매를 직렬 조회해
 * 단지·면적(반올림 ㎡)별 최고가를 apt_highs 에 upsert 한다.
 * 이후 유지는 봇의 일일 신고가 push(/api/machine/apt-highs)가 담당.
 *
 * 안전장치:
 * - 기본 dry-run (DB 쓰기 없음). 실제 반영은 --execute
 * - 직렬 + SLEEP_MS 간격 — MOLIT rate limit·일 트래픽 보호
 * - 구 단위 upsert — 중단돼도 --regions 로 나머지만 재개 가능
 * - upsert 는 "더 높은 가격일 때만 갱신" (전고점 불변 조건)
 *
 * 실행 (Eric 터미널):
 *   npx tsx scripts/seed-apt-highs.ts                        # dry-run, 서울·경기·인천
 *   npx tsx scripts/seed-apt-highs.ts --execute
 *   npx tsx scripts/seed-apt-highs.ts --execute --regions 서울
 *   npx tsx scripts/seed-apt-highs.ts --execute --from 201901
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { DISTRICT_CODE } from '../lib/district-codes';
import { DISTRICT_GROUPS } from '../lib/district-groups';

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const SLEEP_MS = 130;          // fetch 간격 — 일 1만 한도·QPS 보호
const MAX_PAGES = 3;           // 월 최대 3,000건 (기존 컨벤션)
const CHUNK = 500;             // upsert 배치 행 수

// ── env ──
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// ── 인자 ──
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const fromArg = args[args.indexOf('--from') + 1];
const FROM_YM = args.includes('--from') && /^\d{6}$/.test(fromArg) ? fromArg : '201901';
const regionsArg = args.includes('--regions') ? args[args.indexOf('--regions') + 1] : '서울,경기,인천';
const REGION_LABELS = regionsArg.split(',').map((s) => s.trim());

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** FROM_YM ~ 이번 달 'YYYYMM' 목록 (과거 → 현재) */
function monthRange(): string[] {
  const out: string[] = [];
  const now = new Date();
  let y = parseInt(FROM_YM.slice(0, 4));
  let m = parseInt(FROM_YM.slice(4, 6));
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** 한 페이지 fetch — totalCount 누락(에러 XML) 시 1회 재시도 */
async function fetchPage(apiKey: string, lawdCd: string, ym: string, pageNo: number): Promise<string> {
  const url = `${BASE_URL}?serviceKey=${apiKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${ym}&numOfRows=1000&pageNo=${pageNo}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url);
      const xml = await res.text();
      if (xml.includes('<totalCount>')) return xml;
    } catch { /* 재시도 */ }
    await sleep(600);
  }
  return '';
}

interface High { price: number; dealDate: string }

function collectHighs(xml: string, acc: Map<string, High>) {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  for (const item of items) {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';
    const aptNm = get('aptNm');
    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const area  = Math.round(parseFloat(get('excluUseAr')));
    const year  = get('dealYear');
    if (!aptNm || !price || !area || !year) continue;
    const dealDate = `${year}-${get('dealMonth').padStart(2, '0')}-${(get('dealDay') || '15').padStart(2, '0')}`;

    const key = `${aptNm}|${area}`;
    const prev = acc.get(key);
    if (!prev || price > prev.price) acc.set(key, { price, dealDate });
  }
}

async function upsertDistrict(
  sql: ReturnType<typeof neon<false, false>>,
  district: string,
  acc: Map<string, High>,
): Promise<number> {
  const entries = [...acc.entries()];
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const ids       = chunk.map(([k]) => `${district}|${k}`);
    const names     = chunk.map(([k]) => k.split('|')[0]);
    const areas     = chunk.map(([k]) => parseInt(k.split('|')[1]));
    const prices    = chunk.map(([, v]) => v.price);
    const dealDates = chunk.map(([, v]) => v.dealDate);

    await sql`
      INSERT INTO apt_highs (id, district, apt_name, area, price, deal_date, source)
      SELECT id, ${district}, apt_name, area, price, deal_date, 'seed'
      FROM unnest(
        ${ids}::text[], ${names}::text[], ${areas}::int[],
        ${prices}::int[], ${dealDates}::text[]
      ) AS t(id, apt_name, area, price, deal_date)
      ON CONFLICT (id) DO UPDATE SET
        price      = GREATEST(apt_highs.price, excluded.price),
        deal_date  = CASE WHEN excluded.price > apt_highs.price THEN excluded.deal_date ELSE apt_highs.deal_date END,
        source     = CASE WHEN excluded.price > apt_highs.price THEN excluded.source ELSE apt_highs.source END,
        updated_at = now()
    `;
  }
  return entries.length;
}

async function main() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) { console.error('PUBLIC_DATA_API_KEY 미설정'); process.exit(1); }
  const apiKey = decodeURIComponent(rawKey);

  const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (EXECUTE && !dbUrl) { console.error('DATABASE_URL 미설정'); process.exit(1); }
  const sql = EXECUTE ? neon(dbUrl!) : null;

  const targets = DISTRICT_GROUPS
    .filter((g) => REGION_LABELS.includes(g.label))
    .flatMap((g) => g.districts.filter((d) => DISTRICT_CODE[d]));

  const months = monthRange();
  console.log(`${EXECUTE ? '🔴 EXECUTE' : '🟡 DRY-RUN'} — ${REGION_LABELS.join('·')} ${targets.length}개 구 × ${months.length}개월 (${FROM_YM}~)`);
  console.log(`예상 fetch ≈ ${targets.length * months.length}회 (MOLIT 일 한도 확인 후 실행)\n`);

  let totalFetches = 0;
  let totalRows = 0;

  for (const district of targets) {
    const lawdCd = DISTRICT_CODE[district];
    const acc = new Map<string, High>();
    let fetches = 0;

    for (const ym of months) {
      const first = await fetchPage(apiKey, lawdCd, ym, 1);
      fetches++;
      await sleep(SLEEP_MS);
      if (!first) continue;
      collectHighs(first, acc);

      const total = parseInt(first.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? '0');
      const pages = Math.min(Math.ceil(total / 1000), MAX_PAGES);
      for (let p = 2; p <= pages; p++) {
        const xml = await fetchPage(apiKey, lawdCd, ym, p);
        fetches++;
        await sleep(SLEEP_MS);
        collectHighs(xml, acc);
      }
    }

    totalFetches += fetches;
    if (EXECUTE && sql) {
      const n = await upsertDistrict(sql, district, acc);
      totalRows += n;
      console.log(`✅ ${district}: fetch ${fetches}회 → 고점 ${n.toLocaleString()}행 upsert`);
    } else {
      totalRows += acc.size;
      const top = [...acc.entries()].sort((a, b) => b[1].price - a[1].price)[0];
      console.log(`🟡 ${district}: fetch ${fetches}회 → 고점 ${acc.size.toLocaleString()}행 (최고 ${top ? `${top[0].split('|')[0]} ${(top[1].price / 10000).toFixed(1)}억` : '—'})`);
    }
  }

  console.log(`\n완료 — fetch ${totalFetches.toLocaleString()}회 · 고점 ${totalRows.toLocaleString()}행${EXECUTE ? ' 반영' : ' (dry-run, 미반영)'}`);
}

main();
