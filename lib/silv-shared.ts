import { type Transaction, type AptGroup } from '@/lib/tx-shared';
import { decodeXmlEntities } from '@/lib/xml-entities';
import { transactionGroupKey } from '@/lib/transaction-identity';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';

/**
 * 분양권/입주권 공용 파서 — 분양권 탭.
 *
 * MOLIT RTMSDataSvcSilvTrade XML → Transaction (매매와 동일 가격 골격).
 * 순수 함수 (단위 테스트 대상). 봇 fetch_realestate 의 분양입주권 수집과 동일 필드.
 */

/** MOLIT 분양권전매 XML → 거래 배열 (불량 행 제외) */
export function parseSilvXml(xml: string, district: string): Transaction[] {
  const activeByKey = new Map<string, Transaction>();
  const canceledKeys = new Set<string>();
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  for (const item of items) {
    const get = (tag: string) =>
      item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

    const price = parseInt(get('dealAmount').replace(/,/g, ''));
    const area  = parseFloat(get('excluUseAr'));
    const aptNm = decodeXmlEntities(get('aptNm'));
    const year  = get('dealYear');
    if (!price || !area || !aptNm || !year) continue;

    const month = get('dealMonth').padStart(2, '0');
    const day   = (get('dealDay') || '0').padStart(2, '0');
    const floorRaw = parseInt(get('floor'), 10);
    const floor = Number.isFinite(floorRaw) ? floorRaw : null;
    const date = `${year}-${month}-${day}`;
    const key = [
      get('umdNm'),
      get('jibun'),
      normalizeMLTMName(aptNm),
      area.toFixed(2),
      floor == null ? '' : String(floor),
      date,
      String(price),
    ].join('\u0000');

    if (get('cdealType') === 'O') {
      canceledKeys.add(key);
      activeByKey.delete(key);
      continue;
    }
    if (canceledKeys.has(key)) continue;

    activeByKey.set(key, {
      aptName:      aptNm,
      district,
      dong:         get('umdNm'),
      area:         Math.round(area),
      floor:        floor || 1,
      price,
      pricePerArea: Math.round(price / area),
      date:         day === '00' ? `${year}-${month}` : date,
      buildYear:    parseInt(get('buildYear')) || null,
    });
  }
  return [...activeByKey.values()];
}

/** 단지별 그룹핑 — 매매 AptGroup 과 동일 규칙 (거래 많은 순 정렬은 호출부) */
export function groupSilvTransactions(txs: Transaction[]): AptGroup[] {
  const grouped: Record<string, AptGroup> = {};
  for (const tx of txs) {
    const groupKey = transactionGroupKey(tx.aptName, tx.dong);
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        id:           `${tx.dong || 'unknown'}-${tx.aptName}`.replace(/\s/g, '-'),
        name:         tx.aptName,
        district:     tx.district,
        dong:         tx.dong || null,
        buildYear:    tx.buildYear ?? null,
        areas:        [],
        transactions: [],
      };
    }
    const g = grouped[groupKey];
    g.transactions.push(tx);
    if (!g.areas.includes(tx.area)) g.areas.push(tx.area);
    if (!g.buildYear && tx.buildYear) g.buildYear = tx.buildYear;
  }
  return Object.values(grouped);
}
