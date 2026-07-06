import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getMonthList, fetchRentMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { parseRentXml, groupRentTransactions, isJeonse } from '@/lib/rent-shared';

/**
 * 전월세 실거래 API — 사이클 II (전세·월세 탭)
 *
 * GET /api/transactions/rent?district=강남구&months=3&rentType=jeonse|monthly|all&aptName=&limit=
 * 매매(/api/transactions)와 동일한 응답 골격 { data, district, months, total }.
 * MOLIT 부하: 매매와 같은 월·구 단위 fetch 캐시(24h) 사용.
 */

const APT_NAME_MAX_LEN = 50;

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
    const xmls = await Promise.all(
      getMonthList(months).map((yyyymm) =>
        fetchRentMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm)).catch(() => '')
      )
    );

    let transactions = xmls.flatMap((xml) => parseRentXml(xml, district));

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
      .slice(0, aptName ? 100 : limit);

    return NextResponse.json(
      { data: result, district, months, rentType, total: transactions.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[transactions/rent API] 조회 실패:', error);
    return NextResponse.json({ error: '전월세 조회 실패' }, { status: 500 });
  }
}
