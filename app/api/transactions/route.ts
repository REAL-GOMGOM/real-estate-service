import { NextRequest, NextResponse } from 'next/server';
import { eq, ilike, sql, and, gte, desc, inArray, isNull, or } from 'drizzle-orm';
import { DISTRICT_CODE, findDistrictByLawdCd } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getBlogDb } from '@/lib/db/client';
import { apartments, aptScores, transactions as transactionsTable } from '@/lib/db/schema';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';
import { getMonthList, fetchTradeMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { txSource } from '@/lib/tx-source';
import { molitItemToTransaction, parseTradeXml } from '@/lib/molit-trade-parse';
import {
  findApartmentIdentity,
  matchesApartmentIdentity,
  transactionGroupKey,
  type ApartmentIdentity,
} from '@/lib/transaction-identity';

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
  masterId?:    string | null;
}

interface AptGroupRow {
  id:           string;
  name:         string;
  district:     string;
  dong:         string | null;
  buildYear:    number | null;
  households:   number | null;
  masterId:     string | null;   // 단지 마스터 PK — /apt/[id] 전용 페이지 링크용
  score:        number | null;   // 입지 점수 (주요 단지만) — 모달 배지용 (2026-07-19)
  areas:        number[];
  transactions: TxRow[];
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizedApartmentNameCandidates(apartment: ApartmentIdentity): string[] {
  return [...new Set(
    [apartment.name, ...(apartment.aliases ?? [])]
      .map((name) => normalizeMLTMName(name))
      .filter(Boolean),
  )];
}

// 조회 소스 flag — lib/tx-source.ts 공용 (전월세 라우트와 공유)

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

  // 국토부는 같은 물리 거래의 정상 원거래와 해제 통보를 별도 item으로
  // 함께 내려줄 수 있다. 해제 item만 버리면 원거래가 남으므로 적재와 같은
  // 자연키로 먼저 병합한 뒤 해제된 키 전체를 제외한다.
  const rowsByKey = new Map<string, TxRow>();
  const canceledKeys = new Set<string>();
  responses.forEach((xml) => {
    const items = parseTradeXml(xml);
    items.forEach((item) => {
      const sourceRow = molitItemToTransaction(item, { lawdCd, sigungu: district });
      if (!sourceRow) return;
      if (sourceRow.isCanceled) {
        canceledKeys.add(sourceRow.dedupeKey);
        rowsByKey.delete(sourceRow.dedupeKey);
        return;
      }
      if (canceledKeys.has(sourceRow.dedupeKey)) return;

      const area = sourceRow.areaM2;
      rowsByKey.set(sourceRow.dedupeKey, {
        aptName:      sourceRow.aptName,
        district,
        dong:         sourceRow.umdNm,
        area:         Math.round(area),
        floor:        sourceRow.floor || 1,
        price:        sourceRow.dealAmount,
        pricePerArea: Math.round(sourceRow.dealAmount / area),
        date:         sourceRow.dealDate.endsWith('-00')
          ? sourceRow.dealDate.slice(0, 7)
          : sourceRow.dealDate,
        buildYear:    sourceRow.buildYear ?? null,
        dealType:     'buy',
      });
    });
  });
  return [...rowsByKey.values()];
}

/** transactions 테이블 조회 → TxRow[] (live 와 바이트 동일 형태로 매핑) */
async function fetchDbTxRows(
  lawdCd: string,
  district: string,
  months: number,
  selectedApartment: ApartmentIdentity | null = null,
): Promise<TxRow[]> {
  const monthList = getMonthList(months);                // 최근→과거
  const oldest    = monthList[monthList.length - 1];     // 최소 계약월 'YYYYMM'
  const fromDate  = `${oldest.slice(0, 4)}-${oldest.slice(4, 6)}-01`;

  const normalizedNames = selectedApartment
    ? normalizedApartmentNameCandidates(selectedApartment)
    : [];
  const nameAndDongFallback = selectedApartment?.dong && normalizedNames.length > 0
    ? and(
        isNull(transactionsTable.masterId),
        inArray(transactionsTable.aptNameNorm, normalizedNames),
        eq(transactionsTable.umdNm, selectedApartment.dong),
      )
    : undefined;
  const selectedApartmentPredicate = selectedApartment
    ? (nameAndDongFallback
        ? or(
            eq(transactionsTable.masterId, selectedApartment.id),
            nameAndDongFallback,
          )
        : eq(transactionsTable.masterId, selectedApartment.id))
    : undefined;

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
      masterId:  transactionsTable.masterId,
    })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.lawdCd, lawdCd),
      gte(transactionsTable.dealDate, fromDate),
      eq(transactionsTable.isCanceled, false),
      selectedApartmentPredicate,
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
      masterId:     r.masterId,
    };
  });
}

/**
 * TxRow[] → 단지 그룹핑 + 마스터 조인(세대수·masterId) + 필터·정렬 → 응답.
 * live·db 두 소스가 이 함수를 공유하므로 응답 schema 는 소스와 무관하게 동일.
 */
async function buildGroupedResponse(
  txRows: TxRow[],
  opts: {
    district: string;
    lawdCd: string;
    resolvedAptName: string;
    selectedApartment: ApartmentIdentity | null;
    months: number;
    limit: number;
  },
): Promise<NextResponse> {
  const { district, lawdCd, resolvedAptName, selectedApartment, months, limit } = opts;

  const grouped: Record<string, AptGroupRow> = {};
  txRows.forEach((tx) => {
    const groupKey = transactionGroupKey(tx.aptName, tx.dong);
    const selectedMasterId = selectedApartment && matchesApartmentIdentity(tx, selectedApartment)
      ? selectedApartment.id
      : null;
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        id:           `${tx.dong || 'unknown'}-${tx.aptName}`.replace(/\s/g, '-'),
        name:         tx.aptName,
        district,
        dong:         tx.dong || null,
        buildYear:    tx.buildYear,
        households:   null,
        // aptId 경로는 이미 정확 식별자로 행을 선필터했다. 부가정보 조인이
        // 실패해도 클라이언트가 같은 단지를 유지하도록 ID를 즉시 보존한다.
        masterId:     selectedMasterId ?? tx.masterId ?? null,
        score:        null,
        areas:        [],
        transactions: [],
      };
    }
    grouped[groupKey].transactions.push(tx);
    if (!grouped[groupKey].areas.includes(tx.area)) {
      grouped[groupKey].areas.push(tx.area);
    }
    if (!grouped[groupKey].buildYear && tx.buildYear) {
      grouped[groupKey].buildYear = tx.buildYear;
    }
  });

  // 단지 마스터 조인 — aptId 경로는 선택한 1개, 일반 목록만 lawdCd 일괄 조회.
  // 조인 실패는 fail-open: 카드에서 세대수만 생략되고 조회는 정상 동작.
  try {
    const db = getBlogDb();
    const masterRows = await db
      .select({
        id:              apartments.id,
        name:            apartments.name,
        aliases:         apartments.aliases,
        dong:            apartments.dong,
        totalHouseholds: apartments.totalHouseholds,
      })
      .from(apartments)
      .where(selectedApartment
        ? eq(apartments.id, selectedApartment.id)
        : eq(apartments.lawdCd, lawdCd));

    const identities: ApartmentIdentity[] = masterRows.map((row) => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases,
      dong: row.dong,
    }));
    const masterById = new Map(masterRows.map((row) => [row.id, row]));

    // 입지 점수 (사이클 MM 산출물, 주요 단지만) — 있으면 모달 배지 표시용
    const masterIds = selectedApartment
      ? [selectedApartment.id]
      : masterRows.map((r) => r.id);
    const scoreByMaster = new Map<string, number>();
    if (masterIds.length > 0) {
      const scoreRows = await db
        .select({ masterId: aptScores.masterId, score: aptScores.score })
        .from(aptScores)
        .where(selectedApartment
          ? eq(aptScores.masterId, selectedApartment.id)
          : inArray(aptScores.masterId, masterIds));
      for (const s of scoreRows) {
        if (s.masterId) scoreByMaster.set(s.masterId, s.score);
      }
    }

    Object.values(grouped).forEach((apt) => {
      const transactionIdentity = {
        aptName: apt.name,
        dong: apt.dong,
        masterId: apt.masterId,
      };
      const identity = selectedApartment && matchesApartmentIdentity(transactionIdentity, selectedApartment)
        ? selectedApartment
        : findApartmentIdentity(transactionIdentity, identities);
      const matched = identity ? masterById.get(identity.id) : null;
      if (matched) {
        apt.masterId = matched.id;
        if (matched.totalHouseholds != null) apt.households = matched.totalHouseholds;
        apt.score = scoreByMaster.get(matched.id) ?? null;
      }
    });
  } catch (e) {
    console.error('[transactions API] 마스터 조인 실패 (fail-open):', e);
  }

  const aptName = resolvedAptName;

  const result = Object.values(grouped)
    .filter((apt) => apt.transactions.length >= 1)
    .filter((apt) => selectedApartment
      ? matchesApartmentIdentity(
          { aptName: apt.name, dong: apt.dong, masterId: apt.masterId },
          selectedApartment,
        )
      : !aptName || matchesQuery(apt.name, aptName))
    .sort((a, b) => b.transactions.length - a.transactions.length)
    .slice(0, aptName ? 100 : limit);

  return NextResponse.json(
    {
      data: result,
      district,
      months,
      total: result.reduce((sum, apt) => sum + apt.transactions.length, 0),
      ...(selectedApartment ? { selectedAptId: selectedApartment.id } : {}),
    },
    // CDN 캐시 — 같은 지역·기간 요청은 엣지에서 즉시 응답
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const aptIdParam   = (searchParams.get('aptId')?.trim() ?? '').slice(0, 200);
  const aptNameParam = (searchParams.get('aptName')?.trim() ?? '').slice(0, APT_NAME_MAX_LEN);
  const districtParam = searchParams.get('district')?.trim() ?? '';
  const parsedMonths = parseInt(searchParams.get('months') ?? '3', 10);
  const months       = Number.isFinite(parsedMonths)
    ? Math.min(Math.max(parsedMonths, 1), 36)
    : 3;
  // 응답 단지 수 제한 — 메인 피드 등 경량 소비자용 (페이로드 축소)
  const limit        = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '60') || 60, 1), 100);

  // 우선순위: aptId → aptName(단독) → district
  // district + aptName 동시는 기존 동작(지역 내 단지명 필터) 유지
  let lawdCd: string;
  let district: string;
  let resolvedAptName: string = aptNameParam;
  let selectedApartment: ApartmentIdentity | null = null;

  if (aptIdParam) {
    try {
      const db = getBlogDb();
      const rows = await db
        .select({
          id:      apartments.id,
          name:    apartments.name,
          aliases: apartments.aliases,
          dong:    apartments.dong,
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
      selectedApartment = {
        id: apt.id,
        name: apt.name,
        aliases: apt.aliases,
        dong: apt.dong,
      };
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
        txRows = await fetchDbTxRows(lawdCd, district, months, selectedApartment);
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
          const dbRows = await fetchDbTxRows(lawdCd, district, months, selectedApartment);
          console.log(
            `[transactions shadow] ${district}/${lawdCd} months=${months} live=${txRows.length} db=${dbRows.length}`,
          );
        } catch (e) {
          console.warn('[transactions shadow] db 조회 실패:', e instanceof Error ? e.message : e);
        }
      }
    }

    if (selectedApartment) {
      txRows = txRows.filter((row) => matchesApartmentIdentity(row, selectedApartment!));
    }

    return await buildGroupedResponse(txRows, {
      district,
      lawdCd,
      resolvedAptName,
      selectedApartment,
      months,
      limit,
    });
  } catch (error) {
    console.error('공공API 호출 실패:', error);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}
