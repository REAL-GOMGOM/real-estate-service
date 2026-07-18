import { NextRequest, NextResponse } from 'next/server';
import { eq, and, gte, desc } from 'drizzle-orm';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getMonthList, fetchRentMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { parseRentXml, groupRentTransactions, isJeonse, type RentTransaction } from '@/lib/rent-shared';
import { getBlogDb } from '@/lib/db/client';
import { rentTransactions } from '@/lib/db/schema';
import { txSource } from '@/lib/tx-source';

/**
 * 전월세 실거래 API — 사이클 II (전세·월세 탭) + DB 전환 (2026-07-18)
 *
 * GET /api/transactions/rent?district=강남구&months=3&rentType=jeonse|monthly|all&aptName=&limit=
 * 매매(/api/transactions)와 동일한 응답 골격 { data, district, months, total }.
 * TRANSACTIONS_SOURCE=db 면 rent_transactions 원장 우선 조회(미적재 시 live
 * 폴백), 그 외엔 기존 국토부 실시간 프록시. 응답 schema 불변.
 */

const APT_NAME_MAX_LEN = 50;

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

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const district = searchParams.get('district')?.trim() || '강남구';
  const months   = Math.min(parseInt(searchParams.get('months') ?? '3') || 3, 36);
  const rentType = searchParams.get('rentType') ?? 'all';   // all | jeonse | monthly
  const aptName  = (searchParams.get('aptName') ?? searchParams.get('q') ?? '').trim().slice(0, APT_NAME_MAX_LEN);
  const limit    = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '60') || 60, 1), 100);

  const lawdCd = DISTRICT_CODE[district];
  if (!lawdCd) {
    return NextResponse.json({ error: '지원하지 않는 구: ' + district }, { status: 400 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions/rent API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '전월세 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);

  try {
    let transactions: RentTransaction[] = [];

    // DB 우선 (Phase 2) — 미적재·실패 시 live 폴백 (안전망)
    if (txSource() === 'db') {
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
      const xmls = await Promise.all(
        getMonthList(months).map((yyyymm) =>
          fetchRentMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm)).catch(() => '')
        )
      );
      transactions = xmls.flatMap((xml) => parseRentXml(xml, district));
    }

    if (rentType === 'jeonse')  transactions = transactions.filter(isJeonse);
    if (rentType === 'monthly') transactions = transactions.filter((t) => !isJeonse(t));

    const result = groupRentTransactions(transactions)
      .filter((g) => !aptName || matchesQuery(g.name, aptName))
      .map((g) => {
        g.transactions.sort((a, b) => b.date.localeCompare(a.date));
        g.areas.sort((a, b) => a - b);
        return g;
      })
      .sort((a, b) => b.transactions.length - a.transactions.length)
      .slice(0, aptName ? 100 : limit)
      // 페이로드 절감 — 카드는 최근 계약만 사용 (전월세는 거래량이 매매의 2~3배)
      // maxDeposit/maxMonthlyRent 는 슬라이스 전 전체 거래 기준 — 정렬 정확도 보장 (v2)
      .map((g) => ({
        ...g,
        txCount: g.transactions.length,
        maxDeposit:     g.transactions.reduce((m, t) => Math.max(m, t.deposit), 0),
        maxMonthlyRent: g.transactions.reduce((m, t) => Math.max(m, t.monthlyRent), 0),
        transactions: g.transactions.slice(0, 10),
      }));

    return NextResponse.json(
      { data: result, district, months, rentType, total: transactions.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[transactions/rent API] 조회 실패:', error);
    return NextResponse.json({ error: '전월세 조회 실패' }, { status: 500 });
  }
}
