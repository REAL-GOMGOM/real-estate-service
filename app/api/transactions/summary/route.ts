import { NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

// 이번 달과 지난 달 YYYYMM
function getRecentMonths(): string[] {
  const now = new Date();
  const result: string[] = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

// XML에서 거래 건수와 가격 추출
function parseXml(xml: string): { count: number; prices59: number[]; prices84: number[]; allPrices: number[] } {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  let count = 0;
  const prices59: number[] = [];
  const prices84: number[] = [];
  const allPrices: number[] = [];

  items.forEach((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const area = parseFloat(get('excluUseAr'));
    if (!price || !area) return;

    count++;
    allPrices.push(price);

    // 59㎡ (55~63㎡ 범위)
    if (area >= 55 && area <= 63) prices59.push(price);
    // 84㎡ (80~88㎡ 범위)
    if (area >= 80 && area <= 88) prices84.push(price);
  });

  return { count, prices59, prices84, allPrices };
}

// 신고가 판정 (간이 — 전체 기간 최고가와 비교)
function countNewHighs(xml: string): number {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const aptMaxPrices: Record<string, { maxPrice: number; latestPrice: number }> = {};

  items.forEach((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const aptNm = get('aptNm');
    const area = Math.round(parseFloat(get('excluUseAr')));
    if (!price || !aptNm) return;

    const key = `${aptNm}-${area}`;
    if (!aptMaxPrices[key]) {
      aptMaxPrices[key] = { maxPrice: price, latestPrice: price };
    } else {
      if (price > aptMaxPrices[key].maxPrice) {
        aptMaxPrices[key].maxPrice = price;
      }
      aptMaxPrices[key].latestPrice = price;
    }
  });

  return Object.values(aptMaxPrices).filter(v => v.latestPrice >= v.maxPrice && v.maxPrice > 0).length;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

export async function GET() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions/summary API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '거래 집계 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);
  const months = getRecentMonths();

  try {
    // 시도별로 대표 구 1개씩만 조회해서 추정
    // + 가장 최근 1개월 데이터를 시도별 대표 구 전체에서 가져옴
    const results = await Promise.all(
      DISTRICT_GROUPS.map(async (group) => {
        // 시도 내 대표 구 2개로 추정 (속도와 정확도 밸런스)
        const sampleDistricts = group.districts.slice(0, 2);

        let totalCount = 0;
        let totalNewHighs = 0;
        const all59: number[] = [];
        const all84: number[] = [];

        await Promise.all(
          sampleDistricts.map(async (district) => {
            const lawdCd = DISTRICT_CODE[district];
            if (!lawdCd) return;

            // 최근 1개월만 (속도 확보)
            const latestMonth = months[0];
            const params = new URLSearchParams({
              LAWD_CD: lawdCd,
              DEAL_YMD: latestMonth,
              numOfRows: '1000',
              pageNo: '1',
            });
            const url = BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();

            try {
              const xml = await fetch(url, { next: { revalidate: 21600 } }).then(r => r.text());
              const parsed = parseXml(xml);
              totalCount += parsed.count;
              totalNewHighs += countNewHighs(xml);
              all59.push(...parsed.prices59);
              all84.push(...parsed.prices84);
            } catch {
              // 개별 실패 무시
            }
          })
        );

        // 대표 구 기준이므로 전체 시도 거래량을 추정
        // (대표 구 2개 / 전체 구 수) 비율로 보정
        const ratio = group.districts.length / sampleDistricts.length;

        return {
          label: group.label,
          districtCount: group.districts.length,
          estimatedCount: Math.round(totalCount * ratio),
          sampleCount: totalCount,
          newHighs: totalNewHighs,
          avg59: avg(all59),
          avg84: avg(all84),
          firstDistrict: group.districts[0],
        };
      })
    );

    return NextResponse.json({
      summary: results,
      updatedAt: new Date().toISOString(),
      note: '대표 구 기반 추정치입니다. 상세는 지역을 클릭해주세요.',
    });
  } catch (error) {
    console.error('시도별 집계 실패:', error);
    return NextResponse.json({ error: '집계 실패' }, { status: 500 });
  }
}
