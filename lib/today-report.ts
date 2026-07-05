import 'server-only';
import { DISTRICT_CODE } from '@/lib/district-codes';

/**
 * TODAY'S REPORT 집계 — 사이클 Z2 (메인 마지막 목업 제거)
 *
 * 수도권 4개 구의 국평(80~88㎡) 계약일 기준 최근 30일 평균가와
 * 직전 30일 대비 변동률. MOLIT 2개월 조회 (1시간 캐시).
 * 표본 부족·조회 실패 구는 제외하는 fail-open — 전부 실패 시 null.
 */

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';
const REPORT_DISTRICTS = ['강남구', '서초구', '마포구', '용산구'];
const MIN_SAMPLES = 3; // 구간별 최소 거래 수 (이보다 적으면 통계 무의미)

export interface TodayReportRow {
  name:   string;
  price:  number; // 억 단위 (최근 30일 84㎡ 평균)
  change: number; // 직전 30일 대비 %
}

interface DealRow { price: number; date: string }

function ym(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parse84(xml: string): DealRow[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  const rows: DealRow[] = [];
  items.forEach((item) => {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';
    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const area  = parseFloat(get('excluUseAr'));
    const year  = get('dealYear');
    const month = get('dealMonth').padStart(2, '0');
    const day   = get('dealDay').padStart(2, '0');
    if (!price || !area || !year) return;
    if (area < 80 || area > 88) return; // 국평만
    rows.push({ price, date: `${year}-${month}-${day === '00' ? '15' : day}` });
  });
  return rows;
}

function avg(rows: DealRow[]): number | null {
  if (rows.length < MIN_SAMPLES) return null;
  return rows.reduce((s, r) => s + r.price, 0) / rows.length;
}

export async function getTodayReport(): Promise<TodayReportRow[] | null> {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) return null;
  const apiKey = decodeURIComponent(rawKey);

  const now = new Date();
  const months = [ym(now), ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ym(new Date(now.getFullYear(), now.getMonth() - 2, 1))];
  const cut30 = isoDate(new Date(now.getTime() - 30 * 86400_000));
  const cut60 = isoDate(new Date(now.getTime() - 60 * 86400_000));

  const rows = await Promise.all(
    REPORT_DISTRICTS.map(async (district) => {
      const lawdCd = DISTRICT_CODE[district];
      if (!lawdCd) return null;

      const deals: DealRow[] = [];
      await Promise.all(
        months.map(async (yyyymm) => {
          const params = new URLSearchParams({
            LAWD_CD: lawdCd, DEAL_YMD: yyyymm, numOfRows: '1000', pageNo: '1',
          });
          try {
            const xml = await fetch(BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString(), {
              next: { revalidate: 3600 },
            }).then((r) => r.text());
            deals.push(...parse84(xml));
          } catch { /* 개별 월 실패 무시 */ }
        })
      );

      const recent = avg(deals.filter((d) => d.date >= cut30));
      const prev   = avg(deals.filter((d) => d.date >= cut60 && d.date < cut30));
      if (recent === null || prev === null || prev === 0) return null;

      return {
        name:   district,
        price:  Math.round(recent / 1000) / 10,                       // 만원 → 억 (소수 1)
        change: Math.round(((recent - prev) / prev) * 1000) / 10,     // %
      };
    })
  );

  const valid = rows.filter((r): r is TodayReportRow => r !== null);
  return valid.length > 0 ? valid : null;
}
