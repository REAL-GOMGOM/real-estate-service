import { NextRequest, NextResponse } from 'next/server';

// ── 시도별 대표 구 ─────────────────────────────────
const REGION_DISTRICTS: Record<string, { name: string; codes: Record<string, string> }> = {
  seoul: {
    name: '서울특별시',
    codes: {
      '강남구': '11680', '서초구': '11650', '용산구': '11170', '송파구': '11710',
      '성동구': '11200', '마포구': '11440', '영등포구': '11560', '양천구': '11470',
      '강동구': '11740', '강서구': '11500', '노원구': '11350', '광진구': '11215',
      '동작구': '11590', '관악구': '11620', '구로구': '11530', '도봉구': '11320',
      '동대문구': '11230', '서대문구': '11410', '성북구': '11290', '은평구': '11380',
      '종로구': '11110', '중구': '11140', '중랑구': '11260', '강북구': '11305',
      '금천구': '11545',
    },
  },
  busan: {
    name: '부산광역시',
    codes: { '해운대구': '26350', '수영구': '26380', '동래구': '26260' },
  },
  daegu: {
    name: '대구광역시',
    codes: { '수성구': '27260', '달서구': '27290' },
  },
  incheon: {
    name: '인천광역시',
    codes: { '연수구': '28185', '서구': '28237' },
  },
  gyeonggi: {
    name: '경기도',
    codes: { '성남시 분당구': '41135', '과천시': '41290', '수원시 영통구': '41117' },
  },
};

const TRADE_BASE = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const EXCHANGE_RATE = 1450;

// ── 포맷 헬퍼 ──────────────────────────────────────
function formatPrice(manwon: number): string {
  if (manwon >= 10000) return `${(manwon / 10000).toFixed(1)}억`;
  return `${manwon.toLocaleString()}만`;
}
function formatDollar(manwon: number): string {
  const usd = (manwon * 10000) / EXCHANGE_RATE;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(usd / 1000)}K`;
}
function toPyeong(area: number): number {
  return Math.round(area / 3.3058);
}
function getMonths(count: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}
function areaFilter(area: string, excluUseAr: number): boolean {
  if (area === 'all') return true;
  if (area === '59') return excluUseAr <= 60;
  if (area === '84') return excluUseAr > 60 && excluUseAr <= 85;
  if (area === 'large') return excluUseAr > 85;
  return true;
}

// ── 거래 데이터 수집 ────────────────────────────────
interface Trade {
  aptName: string;
  district: string;
  dong: string;
  price: number;
  area: number;
  floor: number;
  dealDate: string;
  region: string;
}

async function fetchDistrict(
  apiKey: string, lawdCd: string, district: string, month: string, region: string,
): Promise<Trade[]> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10000);
  try {
    const params = new URLSearchParams({ LAWD_CD: lawdCd, DEAL_YMD: month, numOfRows: '1000', pageNo: '1' });
    const res = await fetch(`${TRADE_BASE}?serviceKey=${apiKey}&${params}`, {
      signal: controller.signal, next: { revalidate: 3600 },
    });
    const xml = await res.text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    const trades: Trade[] = [];
    for (const item of items) {
      const get = (tag: string) => item.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1]?.trim() ?? '';
      const aptName = get('aptNm');
      const price = parseInt(get('dealAmount').replace(/,/g, ''), 10);
      const a = parseFloat(get('excluUseAr'));
      if (!aptName || !price || !a) continue;
      const y = get('dealYear');
      const m = get('dealMonth').padStart(2, '0');
      trades.push({
        aptName, district, dong: get('umdNm'), price, area: a,
        floor: parseInt(get('floor')) || 0, dealDate: `${y}-${m}`, region,
      });
    }
    return trades;
  } finally {
    clearTimeout(tid);
  }
}

// ── R-ONE 상승률 ────────────────────────────────────
type ChangeEntry = { name: string; changeRate: number; direction: 'up' | 'down' | 'flat' };
type RankedEntry = ChangeEntry & { rank: number };

async function fetchPriceChange(apiKey: string): Promise<{ regions: RankedEntry[]; seoulDistricts: RankedEntry[] }> {
  const STATBL_ID = 'A_2024_00045';

  async function fetchRawRows(month: string) {
    const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${STATBL_ID}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=500`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
    const json = await res.json();
    return json?.SttsApiTblData?.[1]?.row || [];
  }

  function parseRegions(rows: any[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const r of rows) {
      if ((r.CLS_FULLNM || '').split('>').length === 1) {
        result[r.CLS_NM] = parseFloat(r.DTA_VAL);
      }
    }
    return result;
  }

  function parseSeoulDistricts(rows: any[]): Record<string, number> {
    const pathMap: Record<string, number> = {};
    for (const r of rows) {
      const full = r.CLS_FULLNM || '';
      if (full.startsWith('서울>')) {
        pathMap[full] = parseFloat(r.DTA_VAL);
      }
    }
    const allPaths = Object.keys(pathMap);
    const result: Record<string, number> = {};
    for (const path of allPaths) {
      const isLeaf = !allPaths.some((other) => other !== path && other.startsWith(path + '>'));
      if (isLeaf) {
        result[path.split('>').pop() || path] = pathMap[path];
      }
    }
    return result;
  }

  function monthStr(offset: number): string {
    const d = new Date(); d.setMonth(d.getMonth() + offset);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function calcEntries(thisData: Record<string, number>, lastData: Record<string, number>): ChangeEntry[] {
    const entries: ChangeEntry[] = [];
    for (const [name, val] of Object.entries(thisData)) {
      const last = lastData[name];
      if (last == null) continue;
      const rate = ((val - last) / last) * 100;
      entries.push({ name, changeRate: +rate.toFixed(3), direction: rate > 0.01 ? 'up' : rate < -0.01 ? 'down' : 'flat' });
    }
    return entries.sort((a, b) => b.changeRate - a.changeRate);
  }

  // 4개월 원시 데이터 병렬 호출
  const months = [monthStr(0), monthStr(-1), monthStr(-2), monthStr(-3)];
  const rawRows = await Promise.all(months.map(fetchRawRows));

  // 연속 데이터 있는 최신 쌍 찾기
  let thisRows: any[] = [];
  let lastRows: any[] = [];
  for (let i = 0; i < rawRows.length - 1; i++) {
    if (rawRows[i].length > 0 && rawRows[i + 1].length > 0) {
      thisRows = rawRows[i]; lastRows = rawRows[i + 1]; break;
    }
  }

  // 시도별 (depth 1) — 실제 17개 시도만 허용
  const ALLOWED_REGIONS = new Set([
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  ]);
  const regionEntries = calcEntries(parseRegions(thisRows), parseRegions(lastRows));
  const regions = regionEntries
    .filter((e) => ALLOWED_REGIONS.has(e.name))
    .map((e, i) => ({ rank: i + 1, ...e }));

  // 서울 구별 (leaf)
  const seoulEntries = calcEntries(parseSeoulDistricts(thisRows), parseSeoulDistricts(lastRows));
  const seoulDistricts = seoulEntries.slice(0, 10).map((e, i) => ({ rank: i + 1, ...e }));

  return { regions, seoulDistricts };
}

// ── 랭킹 계산 ──────────────────────────────────────
function calcTopPrice(trades: Trade[], regionName: string, limit = 5) {
  return trades
    .filter((t) => regionName === '전국' || t.region === regionName)
    .sort((a, b) => b.price - a.price)
    .slice(0, limit)
    .map((t, i) => ({
      rank: i + 1, aptName: t.aptName, district: t.district, dong: t.dong,
      price: t.price, priceFormatted: formatPrice(t.price), dollarPrice: formatDollar(t.price),
      area: t.area, pyeong: toPyeong(t.area), floor: t.floor, dealDate: t.dealDate,
    }));
}

function calcVolume(trades: Trade[], regionName: string, limit = 5) {
  const map: Record<string, { aptName: string; district: string; count: number; total: number }> = {};
  for (const t of trades) {
    if (regionName !== '전국' && t.region !== regionName) continue;
    const key = `${t.district}-${t.aptName}`;
    if (!map[key]) map[key] = { aptName: t.aptName, district: t.district, count: 0, total: 0 };
    map[key].count++;
    map[key].total += t.price;
  }
  return Object.values(map)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((v, i) => ({
      rank: i + 1, aptName: v.aptName, district: v.district,
      count: v.count, avgPrice: Math.round(v.total / v.count),
      avgPriceFormatted: formatPrice(Math.round(v.total / v.count)),
    }));
}

function calcNewHigh(trades: Trade[], regionName: string, limit = 5) {
  // 같은 단지+비슷한 면적 기준 최고가 vs 최근가
  const groups: Record<string, Trade[]> = {};
  for (const t of trades) {
    if (regionName !== '전국' && t.region !== regionName) continue;
    const key = `${t.district}-${t.aptName}-${Math.round(t.area)}`;
    (groups[key] ||= []).push(t);
  }
  const results: { aptName: string; district: string; price: number; prevHigh: number; diff: number; diffPct: number }[] = [];
  for (const list of Object.values(groups)) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => b.price - a.price);
    const highest = sorted[0];
    const secondHighest = sorted[1];
    if (highest.price > secondHighest.price) {
      const diff = highest.price - secondHighest.price;
      results.push({
        aptName: highest.aptName, district: highest.district,
        price: highest.price, prevHigh: secondHighest.price,
        diff, diffPct: +(diff / secondHighest.price * 100).toFixed(1),
      });
    }
  }
  return results
    .sort((a, b) => b.diff - a.diff)
    .slice(0, limit)
    .map((r, i) => ({
      rank: i + 1, aptName: r.aptName, district: r.district,
      price: r.price, prevHigh: r.prevHigh,
      diffPercent: r.diffPct, diffFormatted: `+${formatPrice(r.diff)}`,
    }));
}

// ── GET 핸들러 ──────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const period = parseInt(searchParams.get('period') || '3');
  const area = searchParams.get('area') || 'all';

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) {
    console.error('[ranking API] PUBLIC_DATA_API_KEY 미설정');
    return NextResponse.json({ error: '데이터를 불러올 수 없습니다' }, { status: 500 });
  }
  const apiKey = decodeURIComponent(rawKey);
  const months = getMonths(Math.min(period, 12));

  try {
    // 전 시도 대표 구 × 월 수 병렬 호출
    const allTasks: Promise<Trade[]>[] = [];
    for (const [, region] of Object.entries(REGION_DISTRICTS)) {
      for (const [district, lawdCd] of Object.entries(region.codes)) {
        for (const month of months) {
          allTasks.push(fetchDistrict(apiKey, lawdCd, district, month, region.name).catch(() => []));
        }
      }
    }
    const settled = await Promise.allSettled(allTasks);
    let allTrades: Trade[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled') allTrades.push(...r.value);
    }

    // 면적 필터
    if (area !== 'all') {
      allTrades = allTrades.filter((t) => areaFilter(area, t.area));
    }

    // 시도별 + 전국 랭킹
    const regionNames = ['전국', ...Object.values(REGION_DISTRICTS).map((r) => r.name)];
    const topPrice: Record<string, ReturnType<typeof calcTopPrice>> = {};
    const volume: Record<string, ReturnType<typeof calcVolume>> = {};
    const newHigh: Record<string, ReturnType<typeof calcNewHigh>> = {};
    for (const name of regionNames) {
      topPrice[name] = calcTopPrice(allTrades, name);
      volume[name] = calcVolume(allTrades, name);
      newHigh[name] = calcNewHigh(allTrades, name);
    }

    // 상승률 (R-ONE, 별도 호출)
    let priceChangeResult: { regions: RankedEntry[]; seoulDistricts: RankedEntry[] } = { regions: [], seoulDistricts: [] };
    const roneKey = process.env.REALESTATE_STAT_API_KEY;
    if (roneKey) {
      try { priceChangeResult = await fetchPriceChange(roneKey); } catch { /* skip */ }
    }

    const periodLabel = period <= 3 ? '최근 3개월' : '최근 1년';
    return NextResponse.json({
      period: periodLabel, area, updatedAt: new Date().toISOString(),
      topPrice, volume, newHigh,
      priceChange: priceChangeResult,
    }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (error) {
    console.error('[ranking API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '랭킹 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}
