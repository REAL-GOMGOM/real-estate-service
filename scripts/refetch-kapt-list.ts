import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { writeFileSync } from 'node:fs';
import { apartments } from '../lib/db/schema';

/**
 * 사이클 I 진단용 — K-apt 단지 목록 전체를 재호출하여 DB와 diff.
 * 읽기 전용. apartments 테이블 INSERT/UPDATE 없음.
 *
 * 적재 스크립트 (scripts/seed-apartments.ts) 와 동일 endpoint·페이지네이션 사용.
 * 응답을 그대로 보존해서 skipped 원인 분류에 활용.
 */

// ─────── 명명 상수 (적재 스크립트와 동일) ───────
const KAPT_BASE_URL  = 'https://apis.data.go.kr/1613000/AptListService3';
const KAPT_OPERATION = 'getTotalAptList3';
const PER_PAGE       = 1000;
const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRY      = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;
const USER_AGENT     = 'Mozilla/5.0 (compatible; naezip-diagnostic/1.0)';

const OUTPUT_PATH = 'data/skipped-list.json';

interface KaptListItem {
  kaptCode: string;
  kaptName: string;
  bjdCode:  string;
  as1:      string;
  as2:      string;
  as3:      string;
  as4:      string | null;
}

interface KaptResponse {
  response: {
    body: {
      items: KaptListItem[] | KaptListItem;
      numOfRows:  number;
      pageNo:     number;
      totalCount: number;
    };
    header: { resultCode: string; resultMsg: string };
  };
}

async function fetchKaptPage(apiKey: string, pageNo: number) {
  const url =
    `${KAPT_BASE_URL}/${KAPT_OPERATION}` +
    `?serviceKey=${apiKey}` +
    `&pageNo=${pageNo}` +
    `&numOfRows=${PER_PAGE}` +
    `&_type=json`;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const data = (await res.json()) as KaptResponse;
      if (data.response.header.resultCode !== '00') {
        throw new Error(`API ${data.response.header.resultCode}: ${data.response.header.resultMsg}`);
      }
      const itemsRaw = data.response.body.items;
      const items = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : [];
      return { items, totalCount: data.response.body.totalCount };
    } catch (err) {
      console.error(`[refetch] page=${pageNo} attempt=${attempt + 1} 실패:`, err);
      if (attempt < MAX_RETRY - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
      } else {
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}

async function main() {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  if (!apiKey) {
    console.error('[refetch] PUBLIC_DATA_API_KEY 미설정');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('[refetch] DATABASE_URL_UNPOOLED 미설정');
    process.exit(1);
  }

  const db = drizzle(neon(url));

  console.log('K-apt 단지 목록 재호출 시작 (읽기 전용)');

  const first = await fetchKaptPage(apiKey, 1);
  const totalPages = Math.ceil(first.totalCount / PER_PAGE);
  console.log(`전체 단지: ${first.totalCount}, pages=${totalPages}`);

  const all: KaptListItem[] = [...first.items];
  for (let page = 2; page <= totalPages; page++) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    const r = await fetchKaptPage(apiKey, page);
    all.push(...r.items);
    if (page % 5 === 0 || page === totalPages) {
      console.log(`page ${page}/${totalPages} 누적 ${all.length}`);
    }
  }

  // dedupe by kaptCode (응답 자체 중복 방어)
  const seen = new Set<string>();
  const deduped = all.filter((it) => {
    if (!it.kaptCode) return true; // 빈 PK는 분류 단계에서 처리
    if (seen.has(it.kaptCode)) return false;
    seen.add(it.kaptCode);
    return true;
  });

  // DB 적재 ID 집합
  const dbIds = await db.select({ id: apartments.id }).from(apartments);
  const dbSet = new Set(dbIds.map((r) => r.id));
  const dbCount = dbIds.length;

  const skipped = deduped.filter((it) => !it.kaptCode || !dbSet.has(it.kaptCode));

  const out = {
    fetchedAt:    new Date().toISOString(),
    totalKaptApi: deduped.length,
    totalDb:      dbCount,
    skippedCount: skipped.length,
    skipped:      skipped.map((it) => ({
      kaptCode:    it.kaptCode ?? '',
      name:        it.kaptName ?? '',
      sido:        it.as1 ?? '',
      sigungu:     it.as2 ?? '',
      dong:        it.as3 ?? '',
      bjdCode:     it.bjdCode ?? '',
      raw:         it,
    })),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log('');
  console.log(`결과 — totalKaptApi: ${out.totalKaptApi}, totalDb: ${out.totalDb}, skipped: ${out.skippedCount}`);
  console.log(`산출물: ${OUTPUT_PATH}`);

  // db 객체는 풀 X (neon-http) — sql 강제 쿼리로 종료 보장
  void sql;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[refetch] 실패:', err);
    process.exit(1);
  });
