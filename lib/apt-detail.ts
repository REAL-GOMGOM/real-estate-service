import 'server-only';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { apartments, aptHighs, aptScores, type Apartment, type AptScore } from '@/lib/db/schema';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import {
  getMonthList, fetchTradeMonthAllPages, fetchRentMonthAllPages, revalidateForMonth,
} from '@/lib/molit-months';
import { buildNameCandidates, aptNameMatches } from '@/lib/apt-name-match';
import { parseRentXml, isJeonse, type RentTransaction } from '@/lib/rent-shared';
import { representativeArea, type AptGroup, type Transaction } from '@/lib/tx-shared';

/**
 * 단지 전용 페이지 데이터 로더 — 사이클 DD.
 *
 * id(kaptCode) → 단지 마스터 → MOLIT 최근 N개월 매매 → 해당 단지 거래만
 * 골라 AptGroup 으로. fetchMolitXml 캐시(24h)를 /api/transactions 와
 * 공유하므로 페이지 추가로 인한 MOLIT 부하 증가는 없다.
 */

export const APT_PAGE_MONTHS = 36;
/** 전세 시세 조회 기간 — 전세가율은 최근 계약이면 충분 (MOLIT 부하 최소화) */
export const APT_RENT_MONTHS = 6;
/** 전월세 탭 테이블 최대 행수 */
const APT_RENT_TABLE_LIMIT = 40;

export interface AptPageData {
  master:   Apartment;
  district: string;      // 사이트 표기 시군구 (예: '송파구')
  group:    AptGroup;    // 거래 0건이어도 반환 (페이지는 항상 렌더)
  /** 역대 전고점 (apt_highs, 사이클 FF) — 시드·봇 데이터 없으면 null → 36개월 폴백 */
  allTimeHigh: { price: number; dealDate: string } | null;
  /** 대표 면적 최근 전세 계약 (사이클 LL — 전세가율용, 최신순 최대 5건) */
  recentJeonse: RentTransaction[];
  /** 단지 전월세 전체 (전세+월세·전 면적, 최근 APT_RENT_MONTHS개월·최신순) — 전월세 탭용 */
  rentTransactions: RentTransaction[];
  /** 입지 점수 (사이클 MM — analysis 산출물, 106개 주요 단지만) */
  aptScore: AptScore | null;
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
  if (!rawKey) return { master, district, group, allTimeHigh: null, recentJeonse: [], rentTransactions: [], aptScore: null };

  const apiKey     = decodeURIComponent(rawKey);
  const candidates = buildNameCandidates({ name: master.name, aliases: master.aliases ?? [] });

  try {
    const xmls = await Promise.all(
      getMonthList(APT_PAGE_MONTHS).map((yyyymm) =>
        fetchTradeMonthAllPages(apiKey, master.lawdCd, yyyymm, revalidateForMonth(yyyymm)).catch(() => '')
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

  // 최근 전세 계약 (사이클 LL — 전세가율) — 대표 면적대(±6㎡), fail-open
  let recentJeonse: RentTransaction[] = [];
  let rentTransactions: RentTransaction[] = [];
  if (group.transactions.length > 0) {
    try {
      const repArea = representativeArea(group);
      const rentXmls = await Promise.all(
        getMonthList(APT_RENT_MONTHS).map((yyyymm) =>
          fetchRentMonthAllPages(apiKey, master.lawdCd, yyyymm, revalidateForMonth(yyyymm)).catch(() => '')
        )
      );
      // 해당 단지 전월세 전체 (전세+월세·전 면적) — 같은 XML 재사용이라 MOLIT 부하 추가 없음
      const allRent = rentXmls
        .flatMap((xml) => parseRentXml(xml, district))
        .filter((tx) => aptNameMatches(tx.aptName, candidates))
        .sort((a, b) => b.date.localeCompare(a.date));
      rentTransactions = allRent.slice(0, APT_RENT_TABLE_LIMIT);
      // 전세가율용 — 대표 면적대(±6㎡) 전세만 최신 5건
      recentJeonse = allRent
        .filter((tx) => isJeonse(tx) && Math.abs(tx.area - repArea) <= 6)
        .slice(0, 5);
    } catch (e) {
      console.error('[apt-detail] 전월세 조회 실패 (fail-open):', e);
    }
  }

  // 역대 전고점 (fail-open) — 대표 면적대(±6㎡) 기준, 거래 없으면 생략
  let allTimeHigh: AptPageData['allTimeHigh'] = null;
  if (group.transactions.length > 0) {
    try {
      const repArea = representativeArea(group);
      const rows = await getBlogDb()
        .select({ price: aptHighs.price, dealDate: aptHighs.dealDate })
        .from(aptHighs)
        .where(and(
          eq(aptHighs.district, district),
          inArray(aptHighs.aptName, [...candidates]),
          gte(aptHighs.area, repArea - 6),
          lte(aptHighs.area, repArea + 6),
        ))
        .orderBy(desc(aptHighs.price))
        .limit(1);
      allTimeHigh = rows[0] ?? null;
    } catch (e) {
      console.error('[apt-detail] apt_highs 조회 실패 (fail-open):', e);
    }
  }

  // 입지 점수 (사이클 MM, fail-open) — import 스크립트가 masterId 를 매칭해둠
  let aptScore: AptScore | null = null;
  try {
    const rows = await getBlogDb()
      .select()
      .from(aptScores)
      .where(eq(aptScores.masterId, master.id))
      .limit(1);
    aptScore = rows[0] ?? null;
  } catch (e) {
    console.error('[apt-detail] apt_scores 조회 실패 (fail-open):', e);
  }

  return { master, district, group, allTimeHigh, recentJeonse, rentTransactions, aptScore };
}
