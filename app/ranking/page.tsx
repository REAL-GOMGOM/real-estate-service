import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import RankingClientPage from '@/components/ranking/RankingClientPage';

export const metadata = { title: '주간 랭킹 | 내집' };

async function fetchVolume() {
  try {
    const { DISTRICT_CODE } = await import('@/lib/district-codes');

    const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
    const SEOUL = [
      '강남구','서초구','송파구','용산구','마포구','성동구','영등포구','양천구',
      '강동구','강서구','광진구','동작구','관악구','구로구','노원구','도봉구',
      '동대문구','서대문구','성북구','은평구','종로구','중구','중랑구','강북구','금천구',
    ];
    const rawKey = process.env.PUBLIC_DATA_API_KEY;
    if (!rawKey) return { period: '', data: [] };
    const apiKey = decodeURIComponent(rawKey);

    const d = new Date(); d.setMonth(d.getMonth() - 1);
    const month = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const period = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;

    const aptMap: Record<string, { name: string; district: string; count: number; totalPrice: number }> = {};

    for (let i = 0; i < SEOUL.length; i += 5) {
      const batch = SEOUL.slice(i, i + 5);
      await Promise.allSettled(batch.map(async (district) => {
        const lawdCd = DISTRICT_CODE[district];
        if (!lawdCd) return;
        const params = new URLSearchParams({ LAWD_CD: lawdCd, DEAL_YMD: month, numOfRows: '1000', pageNo: '1' });
        const res = await fetch(`${BASE_URL}?serviceKey=${apiKey}&${params}`, { next: { revalidate: 3600 } });
        const xml = await res.text();
        const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
        for (const item of items) {
          const get = (tag: string) => item.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1]?.trim() ?? '';
          const aptNm = get('aptNm');
          const price = parseInt(get('dealAmount').replace(/,/g, ''), 10);
          if (!aptNm || !price) continue;
          const key = `${district}-${aptNm}`;
          if (!aptMap[key]) aptMap[key] = { name: aptNm, district, count: 0, totalPrice: 0 };
          aptMap[key].count++;
          aptMap[key].totalPrice += price;
        }
      }));
    }

    const data = Object.values(aptMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((apt, i) => ({ rank: i + 1, name: apt.name, district: apt.district, count: apt.count, avgPrice: Math.round(apt.totalPrice / apt.count) }));

    return { period, data };
  } catch (e) {
    console.error('[ranking] volume fetch error:', e);
    return { period: '', data: [] };
  }
}

async function fetchPriceChange() {
  try {
    const RONE_URL = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
    const STATBL_ID = 'A_2024_00045';
    const apiKey = process.env.REALESTATE_STAT_API_KEY;
    if (!apiKey) return { period: '', type: 'sale', data: [] };

    async function fetchMonth(month: string): Promise<Record<string, number>> {
      const url = `${RONE_URL}?KEY=${apiKey}&STATBL_ID=${STATBL_ID}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=${month}&Type=json&pSize=500`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 3600 } });
      const json = await res.json();
      const rows = json?.SttsApiTblData?.[1]?.row || [];
      const result: Record<string, number> = {};
      for (const r of rows) {
        const full = r.CLS_FULLNM || '';
        if (full.startsWith('서울>') && full.split('>').length === 2) {
          result[full.split('>')[1]] = parseFloat(r.DTA_VAL);
        }
      }
      return result;
    }

    function getMonthStr(offset: number): string {
      const d = new Date(); d.setMonth(d.getMonth() + offset);
      return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    const [m0, m1, m2] = await Promise.all([fetchMonth(getMonthStr(-1)), fetchMonth(getMonthStr(-2)), fetchMonth(getMonthStr(0))]);
    let thisData: Record<string, number> = {};
    let lastData: Record<string, number> = {};
    if (Object.keys(m2).length > 0) { thisData = m2; lastData = m0; }
    else if (Object.keys(m0).length > 0) { thisData = m0; lastData = m1; }
    else { thisData = m1; lastData = {}; }

    const entries: { name: string; changeRate: number; direction: 'up' | 'down' | 'flat' }[] = [];
    for (const [district, thisVal] of Object.entries(thisData)) {
      const lastVal = lastData[district];
      if (lastVal == null) continue;
      const change = ((thisVal - lastVal) / lastVal) * 100;
      entries.push({ name: district, changeRate: +change.toFixed(3), direction: change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'flat' });
    }

    const now = new Date();
    const period = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${Math.ceil(now.getDate() / 7)}주`;
    const data = entries.sort((a, b) => b.changeRate - a.changeRate).slice(0, 10).map((e, i) => ({ rank: i + 1, ...e }));

    return { period, type: 'sale', data };
  } catch (e) {
    console.error('[ranking] price-change fetch error:', e);
    return { period: '', type: 'sale', data: [] };
  }
}

export default async function RankingPage() {
  const [volume, price] = await Promise.all([fetchVolume(), fetchPriceChange()]);

  return (
    <>
      <Header />
      <RankingClientPage
        volumeData={volume.data || []}
        volumePeriod={volume.period || ''}
        priceData={price.data || []}
        pricePeriod={price.period || ''}
      />
      <Footer />
    </>
  );
}
