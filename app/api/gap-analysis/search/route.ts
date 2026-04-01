import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';

const API_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev';

/**
 * GET /api/gap-analysis/search?q=래미안&district=강남구
 * 실거래 데이터에서 단지 검색
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get('q') || '';
    const district = searchParams.get('district') || '강남구';

    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const lawdCd = DISTRICT_CODE[district];
    if (!lawdCd) {
      return NextResponse.json({ results: [] });
    }

    const apiKey = process.env.PUBLIC_DATA_API_KEY;
    if (!apiKey) {
      console.error('[gap-analysis/search API] PUBLIC_DATA_API_KEY 미설정');
      return NextResponse.json({ error: '단지 검색에 실패했습니다' }, { status: 500 });
    }

    // 최근 3개월 데이터에서 검색
    const now = new Date();
    const months: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const complexMap: Record<string, { name: string; dong: string; sizes: Set<number> }> = {};

    for (const month of months) {
      try {
        const url = `${API_URL}?serviceKey=${apiKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${month}&numOfRows=1000&pageNo=1`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 } });
        const text = await res.text();

        // XML 파싱
        const aptNames = text.match(/<aptNm>([^<]+)<\/aptNm>/g) || [];
        const areas = text.match(/<excluUseAr>([^<]+)<\/excluUseAr>/g) || [];
        const dongs = text.match(/<umdNm>([^<]+)<\/umdNm>/g) || [];

        for (let i = 0; i < aptNames.length; i++) {
          const name = aptNames[i].replace(/<\/?aptNm>/g, '').trim();
          const area = parseFloat((areas[i] || '').replace(/<\/?excluUseAr>/g, '').trim());
          const dong = (dongs[i] || '').replace(/<\/?umdNm>/g, '').trim();

          if (!name.includes(q)) continue;

          const key = `${dong}-${name}`;
          if (!complexMap[key]) {
            complexMap[key] = { name, dong, sizes: new Set() };
          }
          if (area > 0) complexMap[key].sizes.add(Math.round(area * 10) / 10);
        }
      } catch {
        // 한 달 실패해도 계속
      }
    }

    const results = Object.entries(complexMap).map(([key, val]) => ({
      id: key,
      name: val.name,
      district,
      dong: val.dong,
      sizes: [...val.sizes].sort((a, b) => a - b),
    })).slice(0, 20);

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('[gap-analysis/search API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '단지 검색에 실패했습니다' }, { status: 500 });
  }
}
