import { NextResponse } from 'next/server';
import { fetchMolitXml } from '@/lib/molit-fetch';
import { DISTRICT_CODE } from '@/lib/district-codes';
import { DISTRICT_GROUPS } from '@/lib/district-groups';

/**
 * 시도별 실거래 집계 API — 사이클 Z5 (추정치 → 전 시군구 실집계)
 *
 * 기존: 시도별 대표 2개 구 × 비율 추정 → 실측과 큰 오차 (치명적).
 * 개편: 등록된 전 시군구(~190개)를 당월 실제 집계. MOLIT 부하 보호를
 * 위해 15개 동시 배치, 응답은 6시간 CDN 캐시 (콜드 1회만 수 초).
 */

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const BATCH_SIZE = 15;

function latestMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

interface DistrictAgg {
  count:    number;
  newHighs: number;
  prices59: number[];
  prices84: number[];
}

/** 한 구의 당월 XML → 집계 (건수·간이 신고가·59/84 가격 표본) */
function aggregate(xml: string): DistrictAgg {
  const agg: DistrictAgg = { count: 0, newHighs: 0, prices59: [], prices84: [] };

  const total = xml.match(/<totalCount>(\d+)<\/totalCount>/)?.[1];
  if (total !== undefined) agg.count = parseInt(total);

  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const byApt: Record<string, { max: number; latest: number }> = {};

  items.forEach((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';
    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const area  = parseFloat(get('excluUseAr'));
    const aptNm = get('aptNm');
    if (!price || !area) return;

    if (area >= 55 && area <= 63) agg.prices59.push(price);
    if (area >= 80 && area <= 88) agg.prices84.push(price);

    if (aptNm) {
      const key = `${aptNm}-${Math.round(area)}`;
      if (!byApt[key]) byApt[key] = { max: price, latest: price };
      else {
        if (price > byApt[key].max) byApt[key].max = price;
        byApt[key].latest = price;
      }
    }
  });

  agg.newHighs = Object.values(byApt).filter((v) => v.latest >= v.max && v.max > 0).length;
  return agg;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

/** 동시성 제한 배치 실행 — MOLIT rate limit 보호 */
async function mapBatched<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export async function GET() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[transactions/summary API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '거래 집계 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);
  const yyyymm = latestMonth();

  try {
    // 전 시군구 flat 목록 (그룹 라벨 유지)
    const targets = DISTRICT_GROUPS.flatMap((g) =>
      g.districts
        .filter((d) => DISTRICT_CODE[d])
        .map((d) => ({ group: g.label, district: d, lawdCd: DISTRICT_CODE[d] }))
    );

    const results = await mapBatched(targets, BATCH_SIZE, async (t) => {
      const params = new URLSearchParams({
        LAWD_CD: t.lawdCd, DEAL_YMD: yyyymm, numOfRows: '1000', pageNo: '1',
      });
      try {
        const xml = await fetchMolitXml(BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString(), 21600);
        return { group: t.group, agg: aggregate(xml) };
      } catch {
        return { group: t.group, agg: { count: 0, newHighs: 0, prices59: [], prices84: [] } as DistrictAgg };
      }
    });

    // 그룹별 합산
    const byGroup = new Map<string, DistrictAgg>();
    for (const r of results) {
      const acc = byGroup.get(r.group) ?? { count: 0, newHighs: 0, prices59: [], prices84: [] };
      acc.count += r.agg.count;
      acc.newHighs += r.agg.newHighs;
      acc.prices59.push(...r.agg.prices59);
      acc.prices84.push(...r.agg.prices84);
      byGroup.set(r.group, acc);
    }

    const summary = DISTRICT_GROUPS.map((g) => {
      const agg = byGroup.get(g.label) ?? { count: 0, newHighs: 0, prices59: [], prices84: [] };
      return {
        label:          g.label,
        districtCount:  g.districts.length,
        // 필드명은 프론트 호환 유지 — 의미는 이제 "실측 누계"
        estimatedCount: agg.count,
        sampleCount:    agg.count,
        newHighs:       agg.newHighs,
        avg59:          avg(agg.prices59),
        avg84:          avg(agg.prices84),
        firstDistrict:  g.districts[0],
      };
    });

    return NextResponse.json(
      {
        summary,
        month: yyyymm,
        updatedAt: new Date().toISOString(),
        note: '등록 시군구 전체 실집계 (당월 신고 누계)',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    console.error('시도별 집계 실패:', error);
    return NextResponse.json({ error: '집계 실패' }, { status: 500 });
  }
}
