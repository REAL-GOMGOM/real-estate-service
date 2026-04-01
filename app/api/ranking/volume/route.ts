import { NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

// 서울 25개 구만 사용 (API 할당량 절약)
const SEOUL_DISTRICTS = [
  '강남구', '서초구', '송파구', '용산구', '마포구', '성동구',
  '영등포구', '양천구', '강동구', '강서구', '광진구', '동작구',
  '관악구', '구로구', '노원구', '도봉구', '동대문구', '서대문구',
  '성북구', '은평구', '종로구', '중구', '중랑구', '강북구', '금천구',
];

function getLatestMonth(): string {
  const d = new Date();
  // 이번 달 초에는 데이터가 없을 수 있으므로 지난 달 사용
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getPeriodLabel(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
}

interface AptAgg {
  name: string;
  district: string;
  count: number;
  totalPrice: number;
}

export async function GET() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[ranking/volume API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ period: '', data: [] }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);
  const month = getLatestMonth();

  try {
    const aptMap: Record<string, AptAgg> = {};

    // 서울 25개 구 병렬 호출 (5개씩 배치)
    for (let i = 0; i < SEOUL_DISTRICTS.length; i += 5) {
      const batch = SEOUL_DISTRICTS.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (district) => {
          const lawdCd = DISTRICT_CODE[district];
          if (!lawdCd) return;
          const params = new URLSearchParams({
            LAWD_CD: lawdCd,
            DEAL_YMD: month,
            numOfRows: '1000',
            pageNo: '1',
          });
          const url = `${BASE_URL}?serviceKey=${apiKey}&${params}`;
          const res = await fetch(url, { next: { revalidate: 3600 } });
          const xml = await res.text();

          const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
          for (const item of items) {
            const get = (tag: string) =>
              item.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1]?.trim() ?? '';

            const aptNm = get('aptNm');
            const price = parseInt(get('dealAmount').replace(/,/g, ''), 10);
            if (!aptNm || !price) continue;

            const key = `${district}-${aptNm}`;
            if (!aptMap[key]) {
              aptMap[key] = { name: aptNm, district, count: 0, totalPrice: 0 };
            }
            aptMap[key].count++;
            aptMap[key].totalPrice += price;
          }
        }),
      );
      // 실패 무시, 나머지 계속
      for (const r of results) {
        if (r.status === 'rejected') {
          console.error('[ranking/volume] batch error:', r.reason);
        }
      }
    }

    const sorted = Object.values(aptMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((apt, i) => ({
        rank: i + 1,
        name: apt.name,
        district: apt.district,
        count: apt.count,
        avgPrice: Math.round(apt.totalPrice / apt.count),
      }));

    return NextResponse.json(
      { period: getPeriodLabel(), data: sorted },
      { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (error) {
    console.error('[ranking/volume API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ period: '', data: [] }, { status: 500 });
  }
}
