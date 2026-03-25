import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';

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
    return NextResponse.json({ error: 'API 키 미설정' }, { status: 500 });
  }

  const apiKey    = decodeURIComponent(rawKey);
  const monthList = getMonthList(months);

  try {
    const responses = await Promise.all(
      monthList.map((yyyymm) => {
        const params = new URLSearchParams({
          LAWD_CD:   lawdCd,
          DEAL_YMD:  yyyymm,
          numOfRows: '100',
          pageNo:    '1',
        });
        const url = BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();
        return fetch(url, { next: { revalidate: 86400 } }).then((r) => r.text());
      })
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
      .filter((apt: any) => !aptName || apt.name.includes(aptName))
      .sort((a: any, b: any) => b.transactions.length - a.transactions.length)
      .slice(0, aptName ? 100 : 60);

    return NextResponse.json({ data: result, district, months, total: transactions.length });

  } catch (error) {
    console.error('공공API 호출 실패:', error);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}
