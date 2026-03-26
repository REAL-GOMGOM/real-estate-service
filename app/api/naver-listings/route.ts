import { NextRequest, NextResponse } from 'next/server';

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://new.land.naver.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

// 아파트명으로 Naver complexNo 검색
async function searchComplex(aptName: string): Promise<{ complexNo: string; name: string; cortarAddress: string } | null> {
  const url = `https://new.land.naver.com/api/search?query=${encodeURIComponent(aptName)}&type=complex&page=1`;
  const res = await fetch(url, { headers: NAVER_HEADERS, next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const json = await res.json();

  const list: any[] = json?.result?.complexList ?? json?.complexes ?? [];
  if (list.length === 0) return null;

  // 이름이 가장 유사한 것 선택
  const matched = list.find((c: any) =>
    c.complexName?.includes(aptName) || aptName.includes(c.complexName)
  ) ?? list[0];

  return {
    complexNo:     String(matched.complexNo),
    name:          matched.complexName,
    cortarAddress: matched.cortarAddress ?? '',
  };
}

// complexNo로 현재 매물 수 + 호가 조회
async function fetchListings(complexNo: string) {
  const url =
    `https://new.land.naver.com/api/articles/complex/${complexNo}` +
    `?realEstateType=APT%3AABYG%3AJGC%3APRE&tradeType=A1` +
    `&tag=%3A%3A%3A%3A%3A%3A%3A%3A&rentPriceMin=0&rentPriceMax=900000000` +
    `&priceMin=0&priceMax=900000000&areaMin=0&areaMax=900000000` +
    `&sameAddressGroup=true&page=1&complexNo=${complexNo}&type=list&order=prc`;

  const res = await fetch(url, { headers: NAVER_HEADERS, next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const json = await res.json();

  const articles: any[] = json?.articleList ?? [];
  const totalCount: number = json?.totalCount ?? 0;

  // 호가 파싱 (단위: 만원)
  const prices = articles
    .map((a: any) => {
      const raw: string = a.dealOrWarrantPrc ?? '';
      const num = parseInt(raw.replace(/[^0-9]/g, ''), 10);
      return isNaN(num) ? null : num;
    })
    .filter((p): p is number => p !== null);

  return {
    totalCount,
    minPrc:   prices.length > 0 ? Math.min(...prices) : null,
    maxPrc:   prices.length > 0 ? Math.max(...prices) : null,
    avgPrc:   prices.length > 0 ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : null,
    articles: articles.slice(0, 5).map((a: any) => ({
      floor:  a.floorInfo ?? '',
      area:   a.areaName ?? '',
      price:  a.dealOrWarrantPrc ?? '',
      desc:   a.articleFeatureDesc ?? '',
    })),
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const aptName   = searchParams.get('aptName') ?? '';
  const complexNo = searchParams.get('complexNo') ?? '';

  if (!aptName && !complexNo) {
    return NextResponse.json({ error: 'aptName 또는 complexNo 필요' }, { status: 400 });
  }

  try {
    let cNo = complexNo;
    let complexName = aptName;

    if (!cNo) {
      const found = await searchComplex(aptName);
      if (!found) return NextResponse.json({ error: '단지를 찾을 수 없습니다' }, { status: 404 });
      cNo = found.complexNo;
      complexName = found.name;
    }

    const listings = await fetchListings(cNo);
    if (!listings) return NextResponse.json({ error: '매물 조회 실패' }, { status: 502 });

    return NextResponse.json({
      complexNo: cNo,
      complexName,
      ...listings,
    });
  } catch (e) {
    console.error('Naver listings error:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
