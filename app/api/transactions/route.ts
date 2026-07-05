import { NextRequest, NextResponse } from 'next/server';
import { eq, ilike, sql } from 'drizzle-orm';
import { DISTRICT_CODE, findDistrictByLawdCd } from '@/lib/district-codes';
import { matchesQuery } from '@/lib/search-utils';
import { getBlogDb } from '@/lib/db/client';
import { apartments } from '@/lib/db/schema';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';
import { getMonthList, fetchTradeMonthAllPages } from '@/lib/molit-months';

const APT_NAME_MAX_LEN = 50;

interface TxRow {
  aptName:      string;
  district:     string;
  dong:         string;
  area:         number;
  floor:        number;
  price:        number;
  pricePerArea: number;
  date:         string;
  buildYear:    number | null;
  dealType:     'buy';
}

interface AptGroupRow {
  id:           string;
  name:         string;
  district:     string;
  dong:         string | null;
  buildYear:    number | null;
  households:   number | null;
  masterId:     string | null;   // 단지 마스터 PK — /apt/[id] 전용 페이지 링크용
  areas:        number[];
  transactions: TxRow[];
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const aptIdParam   = searchParams.get('aptId')?.trim() ?? '';
  const aptNameParam = searchParams.get('aptName')?.trim() ?? '';
  const districtParam = searchParams.get('district')?.trim() ?? '';
  const months       = Math.min(parseInt(searchParams.get('months') ?? '3'), 36);
  // 응답 단지 수 제한 — 메인 피드 등 경량 소비자용 (페이로드 축소)
  const limit        = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '60') || 60, 1), 100);

  // 우선순위: aptId → aptName(단독) → district
  // district + aptName 동시는 기존 동작(지역 내 단지명 필터) 유지
  let lawdCd: string;
  let district: string;
  let resolvedAptName: string = aptNameParam;

  if (aptIdParam) {
    try {
      const db = getBlogDb();
      const rows = await db
        .select({
          id:      apartments.id,
          name:    apartments.name,
          sigungu: apartments.sigungu,
          lawdCd:  apartments.lawdCd,
        })
        .from(apartments)
        .where(eq(apartments.id, aptIdParam))
        .limit(1);
      const apt = rows[0];
      if (!apt) {
        return NextResponse.json({ error: 'apartment not found' }, { status: 404 });
      }
      lawdCd          = apt.lawdCd;
      district        = findDistrictByLawdCd(apt.lawdCd) ?? apt.sigungu;
      resolvedAptName = apt.name;
    } catch (e) {
      console.error('[transactions API] aptId 조회 실패:', e);
      return NextResponse.json({ error: '단지 조회 실패' }, { status: 500 });
    }
  } else if (aptNameParam && !districtParam) {
    // 단지명만으로 검색 — DB 첫 매칭의 lawd_cd 사용
    try {
      const safeName = aptNameParam.slice(0, APT_NAME_MAX_LEN);
      const db = getBlogDb();
      const rows = await db
        .select({
          id:      apartments.id,
          name:    apartments.name,
          sigungu: apartments.sigungu,
          lawdCd:  apartments.lawdCd,
        })
        .from(apartments)
        .where(ilike(apartments.name, `%${escapeLike(safeName)}%`))
        .orderBy(sql`length(${apartments.name}) ASC`)
        .limit(1);
      const apt = rows[0];
      if (!apt) {
        return NextResponse.json({ error: 'no match' }, { status: 404 });
      }
      lawdCd          = apt.lawdCd;
      district        = findDistrictByLawdCd(apt.lawdCd) ?? apt.sigungu;
      resolvedAptName = apt.name;
    } catch (e) {
      console.error('[transactions API] aptName 조회 실패:', e);
      return NextResponse.json({ error: '단지 조회 실패' }, { status: 500 });
    }
  } else {
    // 기존 동작 — district + (선택) aptName
    district = districtParam || '강남구';
    const code = DISTRICT_CODE[district];
    if (!code) {
      return NextResponse.json({ error: '지원하지 않는 구: ' + district }, { status: 400 });
    }
    lawdCd = code;
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
      monthList.map((yyyymm) => fetchTradeMonthAllPages(apiKey, lawdCd, yyyymm))
    );

    const transactions: TxRow[] = [];

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
        const day   = get('dealDay').padStart(2, '0');
        const floor = parseInt(get('floor')) || 1;
        const dong      = get('umdNm');                       // 법정동 (예: 부곡동)
        const buildYear = parseInt(get('buildYear')) || null; // 건축년도 (입주연차 계산용)

        if (!price || !area || !aptNm || !year) return;

        transactions.push({
          aptName:      aptNm,
          district,
          dong,
          area:         Math.round(area),
          floor,
          price,
          pricePerArea: Math.round(price / area),
          // 계약일 — 일 단위까지 (아실형 카드 "26.06.26 계약" 표기용)
          date:         year + '-' + month + (day !== '00' ? '-' + day : ''),
          buildYear,
          dealType:     'buy',
        });
      });
    });

    const grouped: Record<string, AptGroupRow> = {};
    transactions.forEach((tx) => {
      if (!grouped[tx.aptName]) {
        grouped[tx.aptName] = {
          id:           tx.aptName.replace(/\s/g, '-'),
          name:         tx.aptName,
          district,
          dong:         tx.dong || null,
          buildYear:    tx.buildYear,
          households:   null,
          masterId:     null,
          areas:        [],
          transactions: [],
        };
      }
      grouped[tx.aptName].transactions.push(tx);
      if (!grouped[tx.aptName].areas.includes(tx.area)) {
        grouped[tx.aptName].areas.push(tx.area);
      }
      if (!grouped[tx.aptName].buildYear && tx.buildYear) {
        grouped[tx.aptName].buildYear = tx.buildYear;
      }
    });

    // 단지 마스터 조인 — lawdCd 일괄 조회 후 정제명·별칭 매칭 (세대수 부여).
    // 조인 실패는 fail-open: 카드에서 세대수만 생략되고 조회는 정상 동작.
    try {
      const db = getBlogDb();
      const masterRows = await db
        .select({
          id:              apartments.id,
          name:            apartments.name,
          aliases:         apartments.aliases,
          totalHouseholds: apartments.totalHouseholds,
        })
        .from(apartments)
        .where(eq(apartments.lawdCd, lawdCd));

      const masterByName = new Map<string, { id: string; households: number | null }>();
      for (const row of masterRows) {
        const entry = { id: row.id, households: row.totalHouseholds };
        if (!masterByName.has(row.name)) masterByName.set(row.name, entry);
        for (const alias of row.aliases ?? []) {
          if (!masterByName.has(alias)) masterByName.set(alias, entry);
        }
      }

      Object.values(grouped).forEach((apt) => {
        const matched =
          masterByName.get(apt.name) ??
          masterByName.get(normalizeMLTMName(apt.name));
        if (matched) {
          apt.masterId = matched.id;
          if (matched.households != null) apt.households = matched.households;
        }
      });
    } catch (e) {
      console.error('[transactions API] 마스터 조인 실패 (fail-open):', e);
    }

    const aptName = resolvedAptName;

    const result = Object.values(grouped)
      .filter((apt) => apt.transactions.length >= 1)
      .filter((apt) => !aptName || matchesQuery(apt.name, aptName))
      .sort((a, b) => b.transactions.length - a.transactions.length)
      .slice(0, aptName ? 100 : limit);

    return NextResponse.json(
      { data: result, district, months, total: transactions.length },
      // CDN 캐시 — 같은 지역·기간 요청은 엣지에서 즉시 응답 (첫 조회만 MOLIT 페치)
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );

  } catch (error) {
    console.error('공공API 호출 실패:', error);
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 });
  }
}
