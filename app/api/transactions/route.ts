import { NextRequest, NextResponse } from 'next/server';
import { eq, ilike, sql, and, gte, desc } from 'drizzle-orm';
import { DISTRICT_CODE, findDistrictByLawdCd } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getBlogDb } from '@/lib/db/client';
import { apartments, transactions as transactionsTable } from '@/lib/db/schema';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';
import { getMonthList, fetchTradeMonthAllPages, revalidateForMonth } from '@/lib/molit-months';

const APT_NAME_MAX_LEN = 50;

interface TxRow {
  aptName:      string;
  district:     string;
  dong:         string;
  area:         number;
  floor:        number;
  price:        number;
  pricePerArea: number;
  date:         string;
  buildYear:    number | null;
  dealType:     'buy';
}

interface AptGroupRow {
  id:           string;
  name:         string;
  district:     string;
  dong:         string | null;
  buildYear:    number | null;
  households:   number | null;
  masterId:     string | null;   // 단지 마스터 PK — /apt/[id] 전용 페이지 링크용
  areas:        number[];
  transactions: TxRow[];
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * 조회 소스 — Phase 2 자체 DB 적재 롤아웃용 flag. 기본 live 라 회귀 0.
 *   'live'   국토부 실시간 프록시 (기존 동작)
 *   'db'     transactions 테이블 조회 (해당 지역·기간 미적재면 live 폴백)
 *   'shadow' 응답은 live, db 도 함께 조회해 건수 차이만 로깅 (검증용)
 */
type TxSource = 'live' | 'db' | 'shadow';
function txSource(): TxSource {
  const v = process.env.TRANSACTIONS_SOURCE;
  return v === 'db' || v === 'shadow' ? v : 'live';
}

/** 국토부 실시간 조회 → TxRow[] (기존 동작 그대로 추출) */
async function fetchLiveTxRows(
  apiKey: string,
  lawdCd: string,
  district: string,
  months: number,
): Promise<TxRow[]> {
  const monthList = getMonthList(months);
  const responses = await Promise.all(
    monthList.map((yyyymm) =>
      fetchTradeMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm)),
    ),
  );

  const rows: TxRow[] = [];
  responses.forEach((xml) => {
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    items.forEach((item) => {
      const get = (tag: string) =>
        item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

      const price = parseInt(get('dealAmount').replace(/,/g, ''));
      const area  = parseFloat(get('excluUseAr'));
      const aptNm = get('aptNm');
      const year  = get('dealYear');
      const month = get('dealMonth').padStart(2, '0');
      const day   = get('dealDay').padStart(2, '0');
      const floor = parseInt(get('floor')) || 1;
      const dong      = get('umdNm');                       // 법정동 (예: 부곡동)
      const buildYear = parseInt(get('buildYear')) || null; // 건축년도 (입주연차 계산용)

      if (!price || !area || !aptNm || !year) return;

      rows.push({
        aptName:      aptNm,
        district,
        dong,
        area:         Math.round(area),
        floor,
        price,
        pricePerArea: Math.round(price / area),
        // 계약일 — 일 단위까지 (아실형 카드 "26.06.26 계약" 표기용)
        date:         year + '-' + month + (day !== '00' ? '-' + day : ''),
        buildYear,
        dealType:     'buy',
      });
    });
  });
  return rows;
}

/** transactions 테이블 조회 → TxRow[] (live 와 바이트 동일 형태로 매핑) */
async function fetchDbTxRows(lawdCd: string, district: string, months: number): Promise<TxRow[]> {
  const monthList = getMonthList(months);                // 최근→과거
  const oldest    = monthList[monthList.length - 1];     // 최소 계약월 'YYYYMM'
  const fromDate  = `${oldest.slice(0, 4)}-${oldest.slice(4, 6)}-01`;

  const db = getBlogDb();
  const rows = await db
    .select({
      aptName:   transactionsTable.aptName,
      dong:      transactionsTable.umdNm,
      areaM2:    transactionsTable.areaM2,
      floor:     transactionsTable.floor,
      price:     transactionsTable.dealAmount,
      dealDate:  transactionsTable.dealDate,
      buildYear: transactionsTable.buildYear,
    })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.lawdCd, lawdCd),
      gte(transactionsTable.dealDate, fromDate),
    ))
    .orderBy(desc(transactionsTable.dealDate));

  return rows.map((r) => {
    const area = r.areaM2;
    // live 포맷 일치: 일자 '00'(일 미상)이면 월까지만
    const date = r.dealDate.endsWith('-00') ? r.dealDate.slice(0, 7) : r.dealDate;
    return {
      aptName:      r.aptName,
      district,
      dong:         r.dong,
      area:         Math.round(area),
      floor:        r.floor || 1,               // live 의 parseInt||1 과 동일 (0·null→1)
      price:        r.price,
      pricePerArea: Math.round(r.price / area),
      date,
      buildYear:    r.buildYear,
      dealType:     'buy' as const,
    };
  });
}

/**
 * TxRow[] → 단지 그룹핑 + 마스터 조인(세대수·masterId) + 필터·정렬 → 응답.
 * live·db 두 소스가 이 함수를 공유하므로 응답 schema 는 소스와 무관하게 동일.
 */
async function buildGroupedResponse(
  txRows: TxRow[],
  opts: { district: string; lawdCd: string; resolvedAptName: string; months: number; limit: number },
): Promise<NextResponse> {
  const { district, lawdCd, resolvedAptName, months, limit } = opts;

  const grouped: Record<string, AptGroupRow> = {};
  txRows.forEach((tx) => {
    if (!grouped[tx.aptName]) {
      grouped[tx.aptName] = {
        id:           tx.aptName.replace(/\s/g, '-'),
        name:         tx.aptName,
        district,
        dong:         tx.dong || null,
        buildYear:    tx.buildYear,
        households:   null,
        masterId:     null,
        areas:        [],
        transactions: [],
      };
    }
    grouped[tx.aptName].transactions.push(tx);
    if (!grouped[tx.aptName].areas.includes(tx.area)) {
      grouped[tx.aptName].areas.push(tx.area);
    }
    if (!grouped[tx.aptName].buildYear && tx.buildYear) {
      grouped[tx.aptName].buildYear = tx.buildYear;
    }
  });

  // 단지 마스터 조인 — lawdCd 일괄 조회 후 정제명·별칭 매칭 (세대수 부여).
  // 조인 실패는 fail-open: 카드에서 세대수만 생략되고 조회는 정상 동작.
  try {
    const db = getBlogDb();
    const masterRows = await db
      .select({
        id:              apartments.id,
        name:            apartments.name,
        aliases:         apartments.aliases,
        totalHouseholds: apartments.totalHouseholds,
      })
      .from(apartments)
      .where(eq(apartments.lawdCd, lawdCd));

    const masterByName = new Map<string, { id: string; households: number | null }>();
    for (const row of masterRows) {
      const entry = { id: row.id, households: row.totalHouseholds };
      if (!masterByName.has(row.name)) masterByName.set(row.name, entry);
      for (const alias of row.aliases ?? []) {
        if (!masterByName.has(alias)) masterByName.set(alias, entry);
      }
    }

    Object.values(grouped).forEach((apt) => {
      const matched =
        masterByName.get(apt.name) ??
        masterByName.get(normalizeMLTMName(apt.name));
      if (matched) {
        apt.masterId = matched.id;
        if (matched.households != null) apt.households = matched.households;
      }
    });
  } catch (e) {
    console.error('[transactions API] 마스터 조인 실패 (fail-open):', e);
  }

  const aptName = resolvedAptName;

  const result = Object.values(grouped)
    .filter((apt) => apt.transactions.length >= 1)
    .filter((apt) => !aptName || matchesQuery(apt.name, aptName))
    .sort((a, b) => b.transactions.length - a.transactions.length)
    .slice(0, aptName ? 100 : limit);

  return NextResponse.json(
    { data: result, district, months, total: txRows.length },
    // CDN 캐시 — 같은 지역·기간 요청은 엣지에서 즉시 응답
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const aptIdParam   = searchParams.get('aptId')?.trim() ?? '';
  const aptNameParam = searchParams.get('aptName')?.trim() ?? '';
  const districtParam = searchParams.get('district')?.trim() ?? '';
  const months       = Math.min(parseInt(searchParams.get('months') ?? '3'), 36);
  // 응답 단지 수 제한 — 메인 피드 등 경량 소비자용 (페이로드 축소)
  const limit        = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '60') || 60, 1), 100);

  // 우선순위: aptId → aptName(단독) → district
  // district + aptName 동시는 기존 동작(지역 내 단지명 필터) 유지
  let lawdCd: string;
  let district: string;
  let resolvedAptName: string = aptNameParam;

  if (aptIdParam) {
    try {
      const db = getBlogDb();
      const rows = await db
        .select({
          id:      apartments.id,
          name:    apartments.name,
          sigungu: apartments.sigungu,
          lawdCd:  apartments.lawdCd,
        })
        .from(apartments)
        .where(eq(apartments.id, aptIdParam))
        .limit(1);
      const apt = rows[0];
      if (!apt) {
        return NextResponse.json({ error: 'apartment not found' }, { status: 404 });
      }
      lawdCd          = apt.lawdCd;
      district        = findDistrictByLawdCd(apt.lawdCd) ?? apt.sigungu;
      resolvedAptName = apt.name;
    } catch (e) {
      console.error('[transactions API] aptId 조회 실패:', e);
      return NextResponse.json({ error: '단지 조회 실패' }, { status: 500 });
    }
  } else if (aptNameParam && !districtParam) {
    // 단지명만으로 검색 — DB 첫 매칭의 lawd_cd 사용
    try {
      const safeName = aptNameParam.slice(0, APT_NAME_MAX_LEN);
      const db = getBlogDb();
      const rows = await db
        .select({
          id:      apartments.id,
          name:    apartments.name,
          sigungu: apartments.sigungu,
          lawdCd:  apartments.lawdCd,
        })
        .from(apartments)
        .where(ilike(apartments.name, `%${escapeLike(safeName)}%`))
        .orderBy(sql`length(${apartments.name}) ASC`)
        .limit(1);
      const apt = rows[0];
      if (!apt) {
        return NextResponse.json({ error: 'no match' }, { status: 404 });
      }
      lawdCd          = apt.lawdCd;
      district        = findDistrictByLawdCd(apt.lawdCd) ?? apt.sigungu;
      resolvedAptName = apt.name;
    } catch (e) {
      console.error('[transactions API] aptName 조회 실패:', e);
      return NextResponse.json({ error: '단지 조회 실패' }, { status: 500 });
    }
  } else {
    // 기존 동작 — district + (선택) aptName
    district = districtParam || '강남구';
    const code = DISTRICT_CODE[district];
    if (!code) {
      return NextResponse.json({ error: '지원하지 않는 구: ' + district }, { status: 400 });
    }
    lawdCd = code;
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  const apiKey = rawKey ? decodeURIComponent(rawKey) : null;
  const source = txSource();

  try {
    let txRows: TxRow[];

    if (source === 'db') {
      // DB 조회 실패는 사용자에게 노출하지 않고 국토부 라이브로 폴백 (안전한 롤아웃)
      try {
        txRows = await fetchDbTxRows(lawdCd, district, months);
      } catch (e) {
        console.error('[transactions API] DB 조회 실패 — live 폴백:', e instanceof Error ? e.message : e);
        txRows = [];
      }
      // 안전망: DB 미적재(빈 결과)거나 조회 실패면 국토부로 폴백
      if (txRows.length === 0) {
        if (!apiKey) {
          console.error('[transactions API] DB 미적재 + PUBLIC_DATA_API_KEY 미설정');
          return NextResponse.json({ error: '거래 데이터를 불러올 수 없습니다' }, { status: 500 });
        }
        console.warn(`[transactions API] DB 미적재/실패(${district}/${lawdCd}) — live 폴백`);
        txRows = await fetchLiveTxRows(apiKey, lawdCd, district, months);
      }
    } else {
      // 'live' | 'shadow' — 국토부 조회가 응답 소스
      if (!apiKey) {
        console.error('[transactions API] PUBLIC_DATA_API_KEY 미설정');
        return NextResponse.json({ error: '거래 데이터를 불러올 수 없습니다' }, { status: 500 });
      }
      txRows = await fetchLiveTxRows(apiKey, lawdCd, district, months);

      // shadow: db 도 조회해 건수 차이만 로깅 (응답은 live 그대로)
      if (source === 'shadow') {
        try {
          const dbRows = await fetchDbTxRows(lawdCd, district, months);
          console.log(
            `[transactions shadow] ${district}/${lawdCd} months=${months} live=${txRows.length} db=${dbRows.length}`,
          );
        } catch (e) {
          console.warn('[transactions shadow] db 조회 실패:', e instanceof Error ? e.message : e);
        }
      }
    }

    return await buildGroupedResponse(txRows, { district, lawdCd, resolvedAptName, months, limit });
  } catch (error) {
    console.error('공공API 호출 실패:', error);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}
