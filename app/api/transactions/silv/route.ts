import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getMonthList, fetchSilvMonthAllPages, revalidateForMonth } from '@/lib/molit-months';
import { parseSilvXml, groupSilvTransactions } from '@/lib/silv-shared';

/**
 * 분양권 실거래 API — 분양권 탭.
 *
 * GET /api/transactions/silv?district=강남구&months=3&aptName=&limit=
 * 매매(/api/transactions)·전월세와 동일한 응답 골격 { data, district, months, total }.
 * MOLIT 부하: 매매와 같은 월·구 단위 fetch 캐시(24h) 사용.
 */

const APT_NAME_MAX_LEN = 50;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const district = searchParams.get('district')?.trim() || '강남구';
  const months   = Math.min(parseInt(searchParams.get('months') ?? '3') || 3, 36);
  const aptName  = (searchParams.get('aptName') ?? searchParams.get('q') ?? '').trim().slice(0, APT_NAME_MAX_LEN);
  const limit    = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '60') || 60, 1), 100);

  const lawdCd = DISTRICT_CODE[district];
  if (!lawdCd) {
    return NextResponse.json({ error: '지원하지 않는 구: ' + district }, { status: 400 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions/silv API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '분양권 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);

  try {
    const xmls = await Promise.all(
      getMonthList(months).map((yyyymm) =>
        fetchSilvMonthAllPages(apiKey, lawdCd, yyyymm, revalidateForMonth(yyyymm)).catch(() => '')
      )
    );

    const transactions = xmls.flatMap((xml) => parseSilvXml(xml, district));

    const result = groupSilvTransactions(transactions)
      .filter((g) => !aptName || matchesQuery(g.name, aptName))
      .map((g) => {
        g.transactions.sort((a, b) => b.date.localeCompare(a.date));
        g.areas.sort((a, b) => a - b);
        return g;
      })
      .sort((a, b) => b.transactions.length - a.transactions.length)
      .slice(0, aptName ? 100 : limit)
      // 페이로드 절감 — 카드는 최근 계약만 사용
      .map((g) => ({ ...g, txCount: g.transactions.length, transactions: g.transactions.slice(0, 10) }));

    return NextResponse.json(
      { data: result, district, months, total: transactions.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('[transactions/silv API] 조회 실패:', error);
    return NextResponse.json({ error: '분양권 조회 실패' }, { status: 500 });
  }
}
