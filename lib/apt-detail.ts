import 'server-only';
import { eq } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { apartments, type Apartment } from '@/lib/db/schema';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import { getMonthList, fetchTradeMonthAllPages } from '@/lib/molit-months';
import { buildNameCandidates, aptNameMatches } from '@/lib/apt-name-match';
import type { AptGroup, Transaction } from '@/lib/tx-shared';

/**
 * 단지 전용 페이지 데이터 로더 — 사이클 DD.
 *
 * id(kaptCode) → 단지 마스터 → MOLIT 최근 N개월 매매 → 해당 단지 거래만
 * 골라 AptGroup 으로. fetchMolitXml 캐시(24h)를 /api/transactions 와
 * 공유하므로 페이지 추가로 인한 MOLIT 부하 증가는 없다.
 */

export const APT_PAGE_MONTHS = 36;

export interface AptPageData {
  master:   Apartment;
  district: string;      // 사이트 표기 시군구 (예: '송파구')
  group:    AptGroup;    // 거래 0건이어도 반환 (페이지는 항상 렌더)
}

export async function getApartmentById(id: string): Promise<Apartment | null> {
  const rows = await getBlogDb()
    .select()
    .from(apartments)
    .where(eq(apartments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getAptPageData(id: string): Promise<AptPageData | null> {
  const master = await getApartmentById(id);
  if (!master) return null;

  const district = findDistrictByLawdCd(master.lawdCd) ?? master.sigungu;

  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  const group: AptGroup = {
    id:           master.id,
    name:         master.name,
    district,
    dong:         master.dong,
    buildYear:    null,
    households:   master.totalHouseholds,
    areas:        [],
    transactions: [],
  };
  if (!rawKey) return { master, district, group };

  const apiKey     = decodeURIComponent(rawKey);
  const candidates = buildNameCandidates({ name: master.name, aliases: master.aliases ?? [] });

  try {
    const xmls = await Promise.all(
      getMonthList(APT_PAGE_MONTHS).map((yyyymm) =>
        fetchTradeMonthAllPages(apiKey, master.lawdCd, yyyymm).catch(() => '')
      )
    );

    for (const xml of xmls) {
      const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
      for (const item of items) {
        const get = (tag: string) =>
          item.match(new RegExp('<' + tag + '>([^<]*)<\\/' + tag + '>'))?.[1]?.trim() ?? '';

        const aptNm = get('aptNm');
        if (!aptNm || !aptNameMatches(aptNm, candidates)) continue;

        const price = parseInt(get('dealAmount').replace(/,/g, ''));
        const area  = parseFloat(get('excluUseAr'));
        const year  = get('dealYear');
        if (!price || !area || !year) continue;

        const month = get('dealMonth').padStart(2, '0');
        const day   = get('dealDay').padStart(2, '0');

        const tx: Transaction = {
          aptName:      master.name,
          district,
          dong:         get('umdNm') || master.dong,
          area:         Math.round(area),
          floor:        parseInt(get('floor')) || 1,
          price,
          pricePerArea: Math.round(price / area),
          date:         year + '-' + month + (day !== '00' ? '-' + day : ''),
          buildYear:    parseInt(get('buildYear')) || null,
        };
        group.transactions.push(tx);
        if (!group.areas.includes(tx.area)) group.areas.push(tx.area);
        if (!group.buildYear && tx.buildYear) group.buildYear = tx.buildYear;
      }
    }
  } catch (e) {
    console.error('[apt-detail] MOLIT 조회 실패 (fail-open, 거래 없이 렌더):', e);
  }

  group.transactions.sort((a, b) => b.date.localeCompare(a.date));
  group.areas.sort((a, b) => a - b);

  return { master, district, group };
}
