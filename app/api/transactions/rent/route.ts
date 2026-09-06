import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getMonthList, fetchRentMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { fetchWebMolitMonths } from '@/lib/molit-web-query';
import { MolitRequestStoppedError, throwIfMolitAborted } from '@/lib/molit-request-control';
import { parseRentXml, groupRentTransactions, isJeonse, type RentTransaction } from '@/lib/rent-shared';
import { getBlogDb } from '@/lib/db/client';
import { rentTransactions } from '@/lib/db/schema';
import { txSource } from '@/lib/tx-source';
import { matchesApartmentIdentity, transactionGroupKey } from '@/lib/transaction-identity';
import { resolveTransactionApartmentSelection } from '@/lib/transaction-apartment-selection';
import {
  createPublicSnapshotRuntimeFromEnv,
  isPublicSnapshotConfigured,
} from '@/lib/public-snapshots/runtime';
import { buildRentResponseFromSnapshot, type ApartmentIndexItem } from '@/lib/public-snapshots/serving-artifacts';

/**
 * 전월세 실거래 API — 사이클 II (전세·월세 탭) + DB 전환 (2026-07-18)
 *
 * GET /api/transactions/rent?district=강남구&months=3&rentType=jeonse|monthly|all&aptId=&aptName=&aptDong=&limit=
 * 매매(/api/transactions)와 동일한 응답 골격 { data, district, months, total }.
 * TRANSACTIONS_SOURCE=db 면 rent_transactions 원장 우선 조회(미적재 시 live
 * 폴백), 그 외엔 기존 국토부 실시간 프록시. 응답 schema 불변.
 */

const APT_NAME_MAX_LEN = 50;
const TOP_TX_PER_GROUP = 10; // 카드 페이로드 절감 — 그룹당 최근 계약 수 (기존 slice(0,10) 과 동일)

/**
 * 고속 경로 — SQL 집계 푸시다운 (검색어 없는 목록 조회 전용, 2026-07-18).
 *
 * 기존 DB 경로는 조건에 맞는 행 전체(강남 6개월 ~1만 행)를 전송해 JS 에서
 * 그룹핑한다. 이 경로는 그룹 집계와 그룹당 최근 TOP_TX_PER_GROUP 계약만
 * SQL 에서 뽑아 전송량을 ~1/15 로 줄인다 (첫 조회 0.9s → 0.3s 대 목표).
 * aptName 검색은 JS 퍼지 매칭(matchesQuery)이 필요해 기존 행 경로를 쓴다.
 * 실패·빈 결과는 호출부가 행 경로 → live 로 폴백 (안전망 3단).
 */
/** drizzle execute 결과 행 추출 — 드라이버 버전별 {rows}/배열 양쪽 흡수 */
function execRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const rows = (res as { rows?: T[] }).rows;
  return Array.isArray(rows) ? rows : [];
}

async function fetchDbRentGroupsFast(
  lawdCd: string,
  district: string,
  months: number,
  rentType: string,
  limit: number,
): Promise<{ groups: unknown[]; total: number } | null> {
  const monthListArr = getMonthList(months);
  const oldest = monthListArr[monthListArr.length - 1];
  const fromDate = `${oldest.slice(0, 4)}-${oldest.slice(4, 6)}-01`;

  const rentCond =
    rentType === 'jeonse'  ? sql` AND monthly_rent = 0`
    : rentType === 'monthly' ? sql` AND monthly_rent > 0`
    : sql``;

  const db = getBlogDb();

  // Q1 — 전체 건수 (응답 total: 기존 경로와 동일하게 그룹 제한 전 전체 계약 수)
  const totalRes = await db.execute(sql`
    SELECT count(*)::int AS n FROM rent_transactions
    WHERE lawd_cd = ${lawdCd} AND deal_date >= ${fromDate}${rentCond}
  `);
  const total = execRows<{ n: number }>(totalRes)[0]?.n ?? 0;
  if (total === 0) return null; // 미적재 — 호출부 폴백

  // Q2 — 그룹 집계 (거래량순 상위 limit)
  const groupRes = await db.execute(sql`
    SELECT apt_name,
           umd_nm,
           count(*)::int             AS tx_count,
           max(deposit)::int         AS max_deposit,
           max(monthly_rent)::int    AS max_monthly,
           max(build_year)::int      AS build_year,
           array_agg(DISTINCT round(area_m2)::int) AS areas
    FROM rent_transactions
    WHERE lawd_cd = ${lawdCd} AND deal_date >= ${fromDate}${rentCond}
    GROUP BY apt_name, umd_nm
    ORDER BY count(*) DESC
    LIMIT ${limit}
  `);
  const groupRows = execRows<{
    apt_name: string; tx_count: number; max_deposit: number; max_monthly: number;
    build_year: number | null; umd_nm: string; areas: number[];
  }>(groupRes);
  if (groupRows.length === 0) return null;

  // Q3 — 선정된 그룹의 최근 계약 top-N (윈도 함수, 날짜 역순)
  const names = groupRows.map((g) => g.apt_name);
  const txRes = await db.execute(sql`
    SELECT apt_name, umd_nm, area_m2, floor, deposit, monthly_rent, deal_date,
           build_year, contract_type, prev_deposit, prev_monthly_rent
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY apt_name, umd_nm ORDER BY deal_date DESC) AS rn
      FROM rent_transactions
      WHERE lawd_cd = ${lawdCd} AND deal_date >= ${fromDate}${rentCond}
        AND apt_name = ANY(${names})
    ) t WHERE rn <= ${TOP_TX_PER_GROUP}
    ORDER BY apt_name, umd_nm, deal_date DESC
  `);
  const txRows = execRows<{
    apt_name: string; umd_nm: string; area_m2: number; floor: number | null;
    deposit: number; monthly_rent: number; deal_date: string; build_year: number | null;
    contract_type: string | null; prev_deposit: number | null; prev_monthly_rent: number | null;
  }>(txRes);

  // 그룹별 버킷팅 (윈도 정렬 덕에 그룹 내 날짜 역순 유지)
  const txByApt = new Map<string, RentTransaction[]>();
  for (const r of txRows) {
    const tx: RentTransaction = {
      aptName:      r.apt_name,
      district,
      dong:         r.umd_nm,
      area:         Math.round(r.area_m2),
      floor:        r.floor || 1,
      deposit:      r.deposit,
      monthlyRent:  r.monthly_rent,
      date:         r.deal_date.endsWith('-00') ? r.deal_date.slice(0, 7) : r.deal_date,
      buildYear:    r.build_year,
      contractType: r.contract_type ?? '',
      prevDeposit:      r.prev_deposit,
      prevMonthlyRent:  r.prev_monthly_rent,
    };
    const groupKey = transactionGroupKey(r.apt_name, r.umd_nm);
    const arr = txByApt.get(groupKey);
    if (arr) arr.push(tx);
    else txByApt.set(groupKey, [tx]);
  }

  const groups = groupRows.map((g) => ({
    id:           `${g.umd_nm || 'unknown'}-${g.apt_name}`.replace(/\s/g, '-'),
    name:         g.apt_name,
    district,
    dong:         g.umd_nm,
    buildYear:    g.build_year,
    areas:        [...(g.areas ?? [])].sort((a, b) => a - b),
    txCount:        g.tx_count,
    maxDeposit:     g.max_deposit,
    maxMonthlyRent: g.max_monthly,
    transactions: txByApt.get(transactionGroupKey(g.apt_name, g.umd_nm)) ?? [],
  }));

  return { groups, total };
}

/** rent_transactions → RentTransaction[] (live 파서와 동일 형태로 매핑) */
async function fetchDbRentTx(lawdCd: string, district: string, months: number): Promise<RentTransaction[]> {
  const monthListArr = getMonthList(months);              // 최근→과거
  const oldest = monthListArr[monthListArr.length - 1];
  const fromDate = `${oldest.slice(0, 4)}-${oldest.slice(4, 6)}-01`;

  const db = getBlogDb();
  const rows = await db
    .select({
      aptName:         rentTransactions.aptName,
      umdNm:           rentTransactions.umdNm,
      areaM2:          rentTransactions.areaM2,
      floor:           rentTransactions.floor,
      deposit:         rentTransactions.deposit,
      monthlyRent:     rentTransactions.monthlyRent,
      dealDate:        rentTransactions.dealDate,
      buildYear:       rentTransactions.buildYear,
      contractType:    rentTransactions.contractType,
      prevDeposit:     rentTransactions.prevDeposit,
      prevMonthlyRent: rentTransactions.prevMonthlyRent,
    })
    .from(rentTransactions)
    .where(and(
      eq(rentTransactions.lawdCd, lawdCd),
      gte(rentTransactions.dealDate, fromDate),
    ))
    .orderBy(desc(rentTransactions.dealDate));

  return rows.map((r) => ({
    aptName:      r.aptName,
    district,
    dong:         r.umdNm,
    area:         Math.round(r.areaM2),                       // live 파서와 동일 반올림
    floor:        r.floor || 1,
    deposit:      r.deposit,
    monthlyRent:  r.monthlyRent,
    date:         r.dealDate.endsWith('-00') ? r.dealDate.slice(0, 7) : r.dealDate,
    buildYear:    r.buildYear,
    contractType: r.contractType ?? '',
    prevDeposit:      r.prevDeposit,
    prevMonthlyRent:  r.prevMonthlyRent,
  }));
}

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const { searchParams } = req.nextUrl;
  let district = searchParams.get('district')?.trim() || '강남구';
  const parsedMonths = parseInt(searchParams.get('months') ?? '3', 10);
  const months   = Number.isFinite(parsedMonths)
    ? Math.min(Math.max(parsedMonths, 1), 36)
    : 3;
  const rentType = searchParams.get('rentType') ?? 'all';   // all | jeonse | monthly
  const aptName  = (searchParams.get('aptName') ?? searchParams.get('q') ?? '').trim().slice(0, APT_NAME_MAX_LEN);
  const aptId = (searchParams.get('aptId') ?? '').trim().slice(0, 200);
  const aptDong = (searchParams.get('aptDong') ?? '').replace(/\s+/g, '').slice(0, 100);
  const limit    = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '60') || 60, 1), 100);

  let lawdCd = DISTRICT_CODE[district];
  if (!aptId && !lawdCd) {
    return NextResponse.json({ error: '지원하지 않는 구: ' + district }, { status: 400 });
  }

  if (!['all', 'jeonse', 'monthly'].includes(rentType)) {
    return NextResponse.json({ error: '지원하지 않는 전월세 유형입니다' }, { status: 400 });
  }
  const servingMode = isPublicSnapshotConfigured();
  const runtime = createPublicSnapshotRuntimeFromEnv();
  let selectedApartment: ApartmentIndexItem | null = null;
  if (aptId) {
    const selection = await resolveTransactionApartmentSelection({ aptId, runtime, allowDbFallback: !servingMode });
    if (!selection.ok) {
      return NextResponse.json({ error: selection.error }, {
        status: selection.status, headers: { 'Cache-Control': 'no-store' },
      });
    }
    selectedApartment = selection.apartment;
    lawdCd = selection.apartment.lawdCd;
    district = selection.district;
  }

  // Mac mini에서 검증·발행한 직전 스냅샷을 우선 사용한다. 스냅샷이
  // 없거나 손상됐거나 요청 기간을 커버하지 못할 때만 기존 DB/live 경로로 폴백한다.
  try {
    const snapshot = await runtime.getDistrictSnapshot(lawdCd);
    if (req.signal.aborted) return NextResponse.json({ error: '전월세 조회가 취소되었습니다' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
    if (snapshot.status === 'success' && snapshot.data.partition.lawdCd === lawdCd) {
      const served = buildRentResponseFromSnapshot(snapshot.data, {
        months,
        limit,
        aptName,
        aptDong,
        ...(selectedApartment ? { aptId: selectedApartment.id, apartmentIndex: [selectedApartment] } : {}),
        rentType: rentType as 'all' | 'jeonse' | 'monthly',
      });
      if (served.hit) {
        return NextResponse.json(served.body, {
          headers: {
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
            'X-Naezip-Data-Source': 'snapshot',
            'X-Naezip-Snapshot-Generated-At': snapshot.data.generatedAt,
          },
        });
      }
    }
  } catch {
    // 스냅샷 변환 실패는 기존 DB/live 조회를 막지 않는다.
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  const apiKey = rawKey ? decodeURIComponent(rawKey) : null;
  const source = servingMode ? 'live' : txSource();

  try {
    throwIfMolitAborted(req.signal);
    // 고속 경로 — 검색어 없는 목록 조회는 SQL 집계 푸시다운 (실패 시 아래 행 경로로)
    if (source === 'db' && !aptName && !aptDong && !selectedApartment) {
      const fast = await fetchDbRentGroupsFast(lawdCd, district, months, rentType, limit)
        .catch((e) => {
          console.warn('[transactions/rent API] 푸시다운 실패 — 행 경로 폴백:', e instanceof Error ? e.message : e);
          return null;
        });
      if (fast) {
        return NextResponse.json(
          { data: fast.groups, district, months, rentType, total: fast.total, status: 'ok' },
          { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
        );
      }
    }

    let transactions: RentTransaction[] = [];
    let failedMonths: string[] = [];

    // DB 우선 (Phase 2) — 미적재·실패 시 live 폴백 (안전망)
    if (source === 'db') {
      try {
        transactions = await fetchDbRentTx(lawdCd, district, months);
      } catch (e) {
        console.warn('[transactions/rent API] DB 조회 실패 — live 폴백:', e instanceof Error ? e.message : e);
      }
      if (transactions.length === 0) {
        console.warn(`[transactions/rent API] DB 미적재(${district}/${lawdCd}) — live 폴백`);
      }
    }

    if (transactions.length === 0) {
      if (!apiKey) {
        console.error('[transactions/rent API] DB 미적재 + PUBLIC_DATA_API_KEY 미설정');
        return NextResponse.json(
          { error: '전월세 데이터를 불러올 수 없습니다' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        );
      }
      const monthList = getMonthList(months);
      const settled = await fetchWebMolitMonths(
        monthList,
        (yyyymm, options) => fetchRentMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm), options),
        { signal: req.signal, startedAt, allowPartial: true },
      );
      failedMonths = monthList.filter((_, index) => settled[index].status === 'rejected');
      const xmls = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      if (xmls.length === 0) throw new Error('all rent month requests failed');
      transactions = xmls.flatMap((xml) => parseRentXml(xml, district));
    }

    throwIfMolitAborted(req.signal);
    if (rentType === 'jeonse')  transactions = transactions.filter(isJeonse);
    if (rentType === 'monthly') transactions = transactions.filter((t) => !isJeonse(t));
    if (selectedApartment) {
      transactions = transactions.filter((transaction) => matchesApartmentIdentity(transaction, selectedApartment));
    } else if (aptDong) {
      transactions = transactions.filter((transaction) => transaction.dong.replace(/\s+/g, '') === aptDong);
    }

    const matchingGroups = groupRentTransactions(transactions)
      .filter((g) => Boolean(selectedApartment) || !aptName || matchesQuery(g.name, aptName));
    const total = matchingGroups.reduce((sum, group) => sum + group.transactions.length, 0);
    const result = matchingGroups
      .map((g) => {
        g.transactions.sort((a, b) => b.date.localeCompare(a.date));
        g.areas.sort((a, b) => a - b);
        return g;
      })
      .sort((a, b) => b.transactions.length - a.transactions.length)
      .slice(0, !selectedApartment && aptName ? 100 : limit)
      // 지역 목록만 축약한다. 단지 조회는 이전 공유 계약도 찾을 수 있도록 전부 보존한다.
      // maxDeposit/maxMonthlyRent 는 슬라이스 전 전체 거래 기준 — 정렬 정확도 보장 (v2)
      .map((g) => ({
        ...g,
        ...(selectedApartment ? { masterId: selectedApartment.id } : {}),
        txCount: g.transactions.length,
        maxDeposit:     g.transactions.reduce((m, t) => Math.max(m, t.deposit), 0),
        maxMonthlyRent: g.transactions.reduce((m, t) => Math.max(m, t.monthlyRent), 0),
        transactions: selectedApartment || aptName || aptDong ? g.transactions : g.transactions.slice(0, 10),
      }));

    const isPartial = failedMonths.length > 0;
    return NextResponse.json(
      {
        data: result,
        district,
        months,
        rentType,
        total,
        ...(selectedApartment ? { selectedAptId: selectedApartment.id } : {}),
        status: isPartial ? 'partial' : 'ok',
        ...(isPartial ? { failedMonths } : {}),
      },
      { headers: { 'Cache-Control': isPartial ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[transactions/rent API] 조회 실패:', error);
    return NextResponse.json(
      { error: '전월세 조회 실패' },
      { status: servingMode || error instanceof MolitRequestStoppedError ? 503 : 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
