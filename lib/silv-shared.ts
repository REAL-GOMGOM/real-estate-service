import { type Transaction, type AptGroup } from '@/lib/tx-shared';

/**
 * 분양권/입주권 공용 파서 — 분양권 탭.
 *
 * MOLIT RTMSDataSvcSilvTrade XML → Transaction (매매와 동일 가격 골격).
 * 순수 함수 (단위 테스트 대상). 봇 fetch_realestate 의 분양입주권 수집과 동일 필드.
 */

/** MOLIT 분양권전매 XML → 거래 배열 (불량 행 제외) */
export function parseSilvXml(xml: string, district: string): Transaction[] {
  const out: Transaction[] = [];
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const item of items) {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const area  = parseFloat(get('excluUseAr'));
    const aptNm = get('aptNm');
    const year  = get('dealYear');
    if (!price || !area || !aptNm || !year) continue;

    const month = get('dealMonth').padStart(2, '0');
    const day   = get('dealDay').padStart(2, '0');

    out.push({
      aptName:      aptNm,
      district,
      dong:         get('umdNm'),
      area:         Math.round(area),
      floor:        parseInt(get('floor')) || 1,
      price,
      pricePerArea: Math.round(price / area),
      date:         year + '-' + month + (day !== '00' ? '-' + day : ''),
      buildYear:    parseInt(get('buildYear')) || null,
    });
  }
  return out;
}

/** 단지별 그룹핑 — 매매 AptGroup 과 동일 규칙 (거래 많은 순 정렬은 호출부) */
export function groupSilvTransactions(txs: Transaction[]): AptGroup[] {
  const grouped: Record<string, AptGroup> = {};
  for (const tx of txs) {
    if (!grouped[tx.aptName]) {
      grouped[tx.aptName] = {
        id:           tx.aptName.replace(/\s/g, '-'),
        name:         tx.aptName,
        district:     tx.district,
        dong:         tx.dong || null,
        buildYear:    tx.buildYear ?? null,
        areas:        [],
        transactions: [],
      };
    }
    const g = grouped[tx.aptName];
    g.transactions.push(tx);
    if (!g.areas.includes(tx.area)) g.areas.push(tx.area);
    if (!g.buildYear && tx.buildYear) g.buildYear = tx.buildYear;
  }
  return Object.values(grouped);
}
