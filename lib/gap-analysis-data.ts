export interface GapTradeRow {
  name: string;
  dong: string;
  price: number;
  area: number;
  floor: number;
  date: string;
}

export interface GapRentRow {
  name: string;
  dong: string;
  deposit: number;
  area: number;
  date: string;
}

function readTag(item: string, tag: string): string {
  return item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() ?? '';
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function finitePositive(value: string): number | null {
  const parsed = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function xmlItems(xml: string): string[] {
  if (!/<totalCount>\d+<\/totalCount>/.test(xml)) {
    throw new Error('MOLIT 응답에 totalCount가 없습니다.');
  }
  return xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
}

function tradeNaturalKey(item: string): string {
  return [
    'aptNm', 'umdNm', 'jibun', 'excluUseAr', 'floor',
    'dealYear', 'dealMonth', 'dealDay', 'dealAmount',
  ].map((tag) => normalized(readTag(item, tag))).join('|');
}

export function parseGapTradesXml(xml: string): GapTradeRow[] {
  const items = xmlItems(xml);
  const canceled = new Set<string>();

  for (const item of items) {
    const isCanceled = readTag(item, 'cdealType').toUpperCase() === 'O'
      || readTag(item, 'cdealDay') !== '';
    if (isCanceled) canceled.add(tradeNaturalKey(item));
  }

  const unique = new Map<string, GapTradeRow>();
  for (const item of items) {
    const key = tradeNaturalKey(item);
    if (canceled.has(key)) continue;

    const name = decodeXml(readTag(item, 'aptNm'));
    const dong = decodeXml(readTag(item, 'umdNm'));
    const price = finitePositive(readTag(item, 'dealAmount'));
    const area = finitePositive(readTag(item, 'excluUseAr'));
    const floor = Number(readTag(item, 'floor'));
    const year = readTag(item, 'dealYear');
    const month = readTag(item, 'dealMonth').padStart(2, '0');

    if (!name || price === null || area === null || !/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) {
      continue;
    }

    unique.set(key, {
      name,
      dong,
      price,
      area,
      floor: Number.isFinite(floor) ? floor : 0,
      date: `${year}-${month}`,
    });
  }

  return [...unique.values()];
}

export function parseGapRentsXml(xml: string): GapRentRow[] {
  const unique = new Map<string, GapRentRow>();

  for (const item of xmlItems(xml)) {
    const name = decodeXml(readTag(item, 'aptNm'));
    const dong = decodeXml(readTag(item, 'umdNm'));
    const deposit = finitePositive(readTag(item, 'deposit'));
    const area = finitePositive(readTag(item, 'excluUseAr'));
    const year = readTag(item, 'dealYear');
    const month = readTag(item, 'dealMonth').padStart(2, '0');
    const monthlyRent = Number(readTag(item, 'monthlyRent').replace(/,/g, ''));

    // 전세 보증금 비교이므로 월세 계약은 제외한다.
    if (
      !name
      || deposit === null
      || area === null
      || !/^\d{4}$/.test(year)
      || !/^\d{2}$/.test(month)
      || (Number.isFinite(monthlyRent) && monthlyRent > 0)
    ) {
      continue;
    }

    const key = [name, dong, area, deposit, year, month, readTag(item, 'dealDay')]
      .map((value) => normalized(String(value)))
      .join('|');
    unique.set(key, { name, dong, deposit, area, date: `${year}-${month}` });
  }

  return [...unique.values()];
}

export function selectGapRows<T extends { name: string; dong: string; area: number }>(
  rows: T[],
  target: { name: string; dong?: string; size?: number },
): T[] {
  const targetName = normalized(target.name);
  const targetDong = normalized(target.dong ?? '');
  return rows.filter((row) => {
    if (normalized(row.name) !== targetName) return false;
    if (targetDong && normalized(row.dong) !== targetDong) return false;
    if (target.size !== undefined && Math.abs(row.area - target.size) > 0.6) return false;
    return true;
  });
}
