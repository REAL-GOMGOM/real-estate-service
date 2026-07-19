import 'server-only';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import {
  apartments, aptHighs, aptScores, transactions, rentTransactions as rentTxTable,
  type Apartment, type AptScore,
} from '@/lib/db/schema';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import { buildNameCandidates, aptNameMatches } from '@/lib/apt-name-match';
import { isJeonse, type RentTransaction } from '@/lib/rent-shared';
import { representativeArea, type AptGroup, type Transaction } from '@/lib/tx-shared';

/**
 * 단지 전용 페이지 데이터 로더 — 사이클 DD → DB 전환 (2026-07-19).
 *
 * 기존: 콜드 진입마다 MOLIT 라이브 최대 42콜(매매 36개월 + 전월세 6개월)
 * → 수십 초 로딩 사고. 개편: 자체 원장(transactions·rent_transactions)
 * 조회 → 1초 미만. 원장 보존이 매매 13·전월세 7개월이라 표시 기간은
 * 12개월 — 역대 전고점은 apt_highs 가 역대 기준으로 계속 커버한다.
 * (무료 티어 512MB 상한의 구조적 한계 — 유료 전환 시 36개월 복원 백로그)
 */

export const APT_PAGE_MONTHS = 12;
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

/** 이번 달 포함 최근 N개월의 시작일 (YYYY-MM-01) — getMonthList 와 동일 창 */
function monthsWindowStart(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (months - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export async function getAptPageData(id: string): Promise<AptPageData | null> {
  const master = await getApartmentById(id);
  if (!master) return null;

  const district = findDistrictByLawdCd(master.lawdCd) ?? master.sigungu;

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

  const candidates = buildNameCandidates({ name: master.name, aliases: master.aliases ?? [] });
  const db = getBlogDb();

  // 매매 — 자체 원장 최근 12개월 (구 slim 조회 후 단지명 매칭, 취소 제외)
  try {
    const rows = await db
      .select({
        aptName:   transactions.aptName,
        umdNm:     transactions.umdNm,
        areaM2:    transactions.areaM2,
        floor:     transactions.floor,
        price:     transactions.dealAmount,
        dealDate:  transactions.dealDate,
        buildYear: transactions.buildYear,
      })
      .from(transactions)
      .where(and(
        eq(transactions.lawdCd, master.lawdCd),
        gte(transactions.dealDate, monthsWindowStart(APT_PAGE_MONTHS)),
        eq(transactions.isCanceled, false),
      ))
      .orderBy(desc(transactions.dealDate));

    for (const r of rows) {
      if (!aptNameMatches(r.aptName, candidates)) continue;
      const tx: Transaction = {
        aptName:      master.name,
        district,
        dong:         r.umdNm || master.dong,
        area:         Math.round(r.areaM2),
        floor:        r.floor || 1,
        price:        r.price,
        pricePerArea: Math.round(r.price / r.areaM2),
        date:         r.dealDate.endsWith('-00') ? r.dealDate.slice(0, 7) : r.dealDate,
        buildYear:    r.buildYear,
      };
      group.transactions.push(tx);
      if (!group.areas.includes(tx.area)) group.areas.push(tx.area);
      if (!group.buildYear && tx.buildYear) group.buildYear = tx.buildYear;
    }
  } catch (e) {
    console.error('[apt-detail] 원장 조회 실패 (fail-open, 거래 없이 렌더):', e);
  }

  group.areas.sort((a, b) => a - b);

  // 전월세 (사이클 LL — 전세가율 + 전월세 탭) — 자체 원장 최근 6개월, fail-open
  let recentJeonse: RentTransaction[] = [];
  let rentTransactions: RentTransaction[] = [];
  if (group.transactions.length > 0) {
    try {
      const repArea = representativeArea(group);
      const rentRows = await db
        .select({
          aptName:         rentTxTable.aptName,
          umdNm:           rentTxTable.umdNm,
          areaM2:          rentTxTable.areaM2,
          floor:           rentTxTable.floor,
          deposit:         rentTxTable.deposit,
          monthlyRent:     rentTxTable.monthlyRent,
          dealDate:        rentTxTable.dealDate,
          buildYear:       rentTxTable.buildYear,
          contractType:    rentTxTable.contractType,
          prevDeposit:     rentTxTable.prevDeposit,
          prevMonthlyRent: rentTxTable.prevMonthlyRent,
        })
        .from(rentTxTable)
        .where(and(
          eq(rentTxTable.lawdCd, master.lawdCd),
          gte(rentTxTable.dealDate, monthsWindowStart(APT_RENT_MONTHS)),
        ))
        .orderBy(desc(rentTxTable.dealDate));

      const allRent: RentTransaction[] = rentRows
        .filter((r) => aptNameMatches(r.aptName, candidates))
        .map((r) => ({
          aptName:      r.aptName,
          district,
          dong:         r.umdNm,
          area:         Math.round(r.areaM2),
          floor:        r.floor || 1,
          deposit:      r.deposit,
          monthlyRent:  r.monthlyRent,
          date:         r.dealDate.endsWith('-00') ? r.dealDate.slice(0, 7) : r.dealDate,
          buildYear:    r.buildYear,
          contractType: r.contractType ?? '',
          prevDeposit:      r.prevDeposit,
          prevMonthlyRent:  r.prevMonthlyRent,
        }));
      rentTransactions = allRent.slice(0, APT_RENT_TABLE_LIMIT);
      // 전세가율용 — 대표 면적대(±6㎡) 전세만 최신 5건
      recentJeonse = allRent
        .filter((tx) => isJeonse(tx) && Math.abs(tx.area - repArea) <= 6)
        .slice(0, 5);
    } catch (e) {
      console.error('[apt-detail] 전월세 원장 조회 실패 (fail-open):', e);
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
