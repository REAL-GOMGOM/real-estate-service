import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { apartments } from '../lib/db/schema';

/**
 * 사이클 H Phase 2.2.a — K-apt 단지 목록 일괄 적재
 *
 * 출처: 국토교통부 공동주택 단지 목록제공 서비스 (data.go.kr/data/15057332)
 * 전국 약 22,147 단지를 apartments 테이블에 일괄 적재.
 *
 * 멱등성: id (kaptCode) primary key + onConflictDoUpdate.
 * 재실행해도 중복 X. 변경된 시도/시군구/단지명은 갱신.
 *
 * 실행:
 *   전국:    npm run seed:apartments
 *   Dry-run: npm run seed:apartments -- --pages=1
 */

// ─────── 명명 상수 ───────
const KAPT_BASE_URL = 'https://apis.data.go.kr/1613000/AptListService3';
const KAPT_OPERATION = 'getTotalAptList3';
const PER_PAGE = 1000;
const RATE_LIMIT_DELAY_MS = 200;
const MAX_RETRY = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000] as const;
const USER_AGENT = 'Mozilla/5.0 (compatible; naezip-seed/1.0)';
const BJD_CODE_LENGTH = 10;
const LAWD_CD_LENGTH = 5;

// ─────── 응답 타입 ───────
interface KaptListItem {
  kaptCode: string;
  kaptName: string;
  bjdCode: string;
  as1: string;          // 시도
  as2: string;          // 시군구
  as3: string;          // 읍면동
  as4: string | null;   // 도로명 (대부분 null)
}

interface KaptResponse {
  response: {
    body: {
      // items: 1건이면 객체, 다건이면 배열 (data.go.kr 표준 패턴)
      items: KaptListItem[] | KaptListItem;
      numOfRows: number;
      pageNo: number;
      totalCount: number;
    };
    header: {
      resultCode: string;
      resultMsg: string;
    };
  };
}

// ─────── 헬퍼 ───────

/** bjdCode 10자리 → lawdCd 5자리 (실거래 API 키) */
function bjdCodeToLawdCd(bjdCode: string): string | null {
  if (!bjdCode || bjdCode.length !== BJD_CODE_LENGTH) return null;
  return bjdCode.substring(0, LAWD_CD_LENGTH);
}

/** 한 페이지 호출 (재시도·백오프 포함) */
async function fetchKaptPage(apiKey: string, pageNo: number): Promise<{
  items: KaptListItem[];
  totalCount: number;
}> {
  // serviceKey는 raw URL-encoded 그대로 (data.go.kr 표준)
  const url =
    `${KAPT_BASE_URL}/${KAPT_OPERATION}` +
    `?serviceKey=${apiKey}` +
    `&pageNo=${pageNo}` +
    `&numOfRows=${PER_PAGE}` +
    `&_type=json`;

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as KaptResponse;
      if (data.response.header.resultCode !== '00') {
        throw new Error(`API ${data.response.header.resultCode}: ${data.response.header.resultMsg}`);
      }
      const itemsRaw = data.response.body.items;
      const items = Array.isArray(itemsRaw) ? itemsRaw : itemsRaw ? [itemsRaw] : [];
      return {
        items,
        totalCount: data.response.body.totalCount,
      };
    } catch (err) {
      console.error(`[fetchKaptPage] page=${pageNo} attempt=${attempt + 1} 실패:`, err);
      if (attempt < MAX_RETRY - 1) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
      } else {
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}

/** 한 페이지의 단지를 apartments 테이블에 upsert */
type DbClient = ReturnType<typeof drizzle>;

async function upsertApartments(
  db: DbClient,
  items: KaptListItem[],
): Promise<{ inserted: number; skipped: number }> {
  let skipped = 0;

  const rows = items
    .map((item) => {
      const lawdCd = bjdCodeToLawdCd(item.bjdCode);
      if (!item.kaptCode || !item.kaptName || !lawdCd || !item.as1 || !item.as2) {
        skipped++;
        return null;
      }
      return {
        id: item.kaptCode,
        name: item.kaptName,
        aliases: [] as string[],
        sido: item.as1,
        sigungu: item.as2,
        dong: item.as3 || null,
        roadAddress: null,
        jibunAddress: null,
        lawdCd,
        kaptCode: item.kaptCode,
        totalHouseholds: null,
        totalDongs: null,
        lat: null,
        lng: null,
        source: 'kapt',
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return { inserted: 0, skipped };

  await db
    .insert(apartments)
    .values(rows)
    .onConflictDoUpdate({
      target: apartments.id,
      set: {
        name: sql`excluded.name`,
        sido: sql`excluded.sido`,
        sigungu: sql`excluded.sigungu`,
        dong: sql`excluded.dong`,
        lawdCd: sql`excluded.lawd_cd`,
        updatedAt: sql`now()`,
      },
    });

  return { inserted: rows.length, skipped };
}

// ─────── 메인 ───────

async function main() {
  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  if (!apiKey) {
    console.error('[seed:apartments] PUBLIC_DATA_API_KEY 미설정');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('[seed:apartments] DATABASE_URL_UNPOOLED 미설정');
    process.exit(1);
  }

  // dry-run 옵션 (--pages=N)
  const args = process.argv.slice(2);
  const pagesArg = args.find((a) => a.startsWith('--pages='));
  const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1], 10) : Infinity;

  const db = drizzle(neon(url));

  console.log('='.repeat(60));
  console.log('K-apt 단지 목록 적재 시작');
  console.log('='.repeat(60));

  // 1페이지로 totalCount 확인
  const first = await fetchKaptPage(apiKey, 1);
  const totalPages = Math.min(Math.ceil(first.totalCount / PER_PAGE), maxPages);

  console.log(`전국 단지: ${first.totalCount}개`);
  console.log(`페이지 수: ${totalPages} (numOfRows ${PER_PAGE}, max ${maxPages})`);
  console.log('');

  // 1페이지 적재
  const firstResult = await upsertApartments(db, first.items);
  console.log(`page 1/${totalPages}: inserted=${firstResult.inserted} skipped=${firstResult.skipped}`);

  let totalInserted = firstResult.inserted;
  let totalSkipped = firstResult.skipped;

  // 2페이지부터 순회
  for (let page = 2; page <= totalPages; page++) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));

    const result = await fetchKaptPage(apiKey, page);
    const upsert = await upsertApartments(db, result.items);

    totalInserted += upsert.inserted;
    totalSkipped += upsert.skipped;

    console.log(
      `page ${page}/${totalPages}: inserted=${upsert.inserted} skipped=${upsert.skipped} (누적 ${totalInserted})`,
    );
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`적재 완료: 총 ${totalInserted}건 (skipped ${totalSkipped})`);
  console.log('='.repeat(60));

  // 검증 쿼리
  const totalCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(apartments);
  console.log(`\nDB COUNT: ${totalCount[0].c}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed:apartments] 적재 실패:', err);
    process.exit(1);
  });
