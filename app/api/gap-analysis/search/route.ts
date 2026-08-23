import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { parseGapTradesXml } from '@/lib/gap-analysis-data';
import { fetchTradeMonthAllPages, getMonthList, revalidateForMonth } from '@/lib/molit-months';
import { matchesQuery } from '@/lib/search-utils';

/** GET /api/gap-analysis/search?q=래미안&district=강남구 */
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const district = (request.nextUrl.searchParams.get('district') ?? '').trim();

  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ status: 'invalid_request', error: '검색어는 2~80자로 입력해 주세요.' }, { status: 400 });
  }
  const lawdCd = DISTRICT_CODE[district];
  if (!lawdCd) {
    return NextResponse.json({ status: 'invalid_request', error: '지원하지 않는 지역입니다.' }, { status: 400 });
  }

  const apiKey = process.env.PUBLIC_DATA_API_KEY;
  if (!apiKey) {
    console.error('[gap-analysis/search API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json(
      { status: 'unavailable', error: '국토교통부 단지 검색 연결 설정이 없습니다.' },
      { status: 503 },
    );
  }

  const months = getMonthList(3);
  const settled = await Promise.allSettled(
    months.map(async (month) => ({
      month,
      rows: parseGapTradesXml(
        await fetchTradeMonthAllPages(apiKey, lawdCd, month, revalidateForMonth(month)),
      ),
    })),
  );

  const successfulMonths: string[] = [];
  const failedMonths: string[] = [];
  const rows = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      successfulMonths.push(result.value.month);
      return result.value.rows;
    }
    failedMonths.push(months[index]);
    return [];
  });

  if (successfulMonths.length === 0) {
    return NextResponse.json(
      { status: 'unavailable', error: '국토교통부 단지 검색 원본을 확인하지 못했습니다.' },
      { status: 502 },
    );
  }

  const complexMap = new Map<string, { name: string; dong: string; sizes: Set<number> }>();
  for (const row of rows) {
    if (!matchesQuery(row.name, query)) continue;
    const key = `${row.dong}\u0000${row.name}`;
    const existing = complexMap.get(key) ?? { name: row.name, dong: row.dong, sizes: new Set<number>() };
    existing.sizes.add(Math.round(row.area * 10) / 10);
    complexMap.set(key, existing);
  }

  const results = [...complexMap.entries()]
    .map(([id, value]) => ({
      id,
      name: value.name,
      district,
      dong: value.dong,
      sizes: [...value.sizes].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.dong.localeCompare(b.dong, 'ko'))
    .slice(0, 20);

  const status = failedMonths.length > 0 ? 'partial' : 'ok';
  return NextResponse.json(
    {
      status,
      results,
      coverage: { requestedMonths: months, successfulMonths, failedMonths },
      note: failedMonths.length > 0 ? '일부 월 원본이 실패해 확인된 월에서만 검색했습니다.' : undefined,
    },
    {
      headers: {
        'Cache-Control': status === 'ok'
          ? 'public, s-maxage=3600, stale-while-revalidate=86400'
          : 'private, no-store',
      },
    },
  );
}
