import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

function getMonthList(months: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    result.push(`${yyyy}${mm}`);
  }
  return result;
}

async function fetchAllPages(apiKey: string, lawdCd: string, yyyymm: string): Promise<string> {
  const makeUrl = (pageNo: number) => {
    const params = new URLSearchParams({
      LAWD_CD: lawdCd,
      DEAL_YMD: yyyymm,
      numOfRows: '1000',
      pageNo: String(pageNo),
    });
    return BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();
  };

  const firstPage = await fetch(makeUrl(1), { next: { revalidate: 86400 } }).then(r => r.text());

  const totalMatch = firstPage.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1]) : 0;

  if (totalCount <= 1000) return firstPage;

  const totalPages = Math.min(Math.ceil(totalCount / 1000), 3);
  const additionalPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) =>
      fetch(makeUrl(i + 2), { next: { revalidate: 86400 } }).then(r => r.text())
    )
  );

  return [firstPage, ...additionalPages].join('\n');
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const district = searchParams.get('district') ?? '강남구';
  const months   = Math.min(parseInt(searchParams.get('months') ?? '3'), 36);

  const lawdCd = DISTRICT_CODE[district];
  if (!lawdCd) {
    return NextResponse.json({ error: '지원하지 않는 구: ' + district }, { status: 400 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '거래 데이터를 불러올 수 없습니다' }, { status: 500 });
  }

  const apiKey    = decodeURIComponent(rawKey);
  const monthList = getMonthList(months);

  try {
    const responses = await Promise.all(
      monthList.map((yyyymm) => fetchAllPages(apiKey, lawdCd, yyyymm))
    );

    const transactions: any[] = [];

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
        const floor = parseInt(get('floor')) || 1;

        if (!price || !area || !aptNm || !year) return;

        transactions.push({
          aptName:      aptNm,
          district,
          area:         Math.round(area),
          floor,
          price,
          pricePerArea: Math.round(price / area),
          date:         year + '-' + month,
          dealType:     'buy',
        });
      });
    });

    const grouped: Record<string, any> = {};
    transactions.forEach((tx) => {
      if (!grouped[tx.aptName]) {
        grouped[tx.aptName] = {
          id:           tx.aptName.replace(/\s/g, '-'),
          name:         tx.aptName,
          district,
          areas:        [],
          transactions: [],
        };
      }
      grouped[tx.aptName].transactions.push(tx);
      if (!grouped[tx.aptName].areas.includes(tx.area)) {
        grouped[tx.aptName].areas.push(tx.area);
      }
    });

    const aptName = searchParams.get('aptName')?.trim() ?? '';

    const result = Object.values(grouped)
      .filter((apt: any) => apt.transactions.length >= 1)
      .filter((apt: any) => !aptName || matchesQuery(apt.name, aptName))
      .sort((a: any, b: any) => b.transactions.length - a.transactions.length)
      .slice(0, aptName ? 100 : 60);

    return NextResponse.json({ data: result, district, months, total: transactions.length });

  } catch (error) {
    console.error('공공API 호출 실패:', error);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}
