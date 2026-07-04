import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';

/**
 * 구별 거래 현황 API — 사이클 W (아실형 구 칩용)
 *
 * GET /api/transactions/districts?group=서울
 * → 그룹 내 모든 구의 최근 1개월 거래 건수 + 간이 신고가 건수.
 * 상세 뷰 상단 구 칩(건수·신고가 뱃지) 렌더에 사용.
 *
 * MOLIT 응답은 6시간 캐시(revalidate) — 칩은 대략치여도 충분.
 */

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

function latestMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 간이 신고가 건수 — 동일 단지·면적 내 최신가가 기간 최고가면 신고가로 집계 */
function countNewHighs(xml: string): number {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const byApt: Record<string, { max: number; latest: number }> = {};

  items.forEach((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';
    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const aptNm = get('aptNm');
    const area  = Math.round(parseFloat(get('excluUseAr')));
    if (!price || !aptNm) return;

    const key = `${aptNm}-${area}`;
    if (!byApt[key]) {
      byApt[key] = { max: price, latest: price };
    } else {
      if (price > byApt[key].max) byApt[key].max = price;
      byApt[key].latest = price;
    }
  });

  return Object.values(byApt).filter((v) => v.latest >= v.max && v.max > 0).length;
}

export async function GET(req: NextRequest) {
  const groupLabel = req.nextUrl.searchParams.get('group')?.trim() ?? '';
  const group = DISTRICT_GROUPS.find((g) => g.label === groupLabel);
  if (!group) {
    return NextResponse.json({ error: '지원하지 않는 그룹: ' + groupLabel }, { status: 400 });
  }

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions/districts API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '거래 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);
  const yyyymm = latestMonth();

  const districts = await Promise.all(
    group.districts.map(async (district) => {
      const lawdCd = DISTRICT_CODE[district];
      if (!lawdCd) return { district, count: 0, newHighs: 0 };

      const params = new URLSearchParams({
        LAWD_CD: lawdCd,
        DEAL_YMD: yyyymm,
        numOfRows: '1000',
        pageNo: '1',
      });
      const url = BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString();

      try {
        const xml = await fetch(url, { next: { revalidate: 21600 } }).then((r) => r.text());
        const total = parseInt(xml.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? '0');
        return { district, count: total, newHighs: countNewHighs(xml) };
      } catch {
        // 개별 구 실패는 0건으로 fail-open (칩 렌더는 유지)
        return { district, count: 0, newHighs: 0 };
      }
    })
  );

  // 아실형: 건수 많은 순 정렬
  districts.sort((a, b) => b.count - a.count);

  return NextResponse.json({ group: group.label, month: yyyymm, districts });
}
