import 'server-only';
import { cache } from 'react';
import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import {
  apartments, aptHighs, aptScores, transactions, rentTransactions as rentTxTable,
  type Apartment, type AptScore,
} from '@/lib/db/schema';
import { findDistrictByLawdCd } from '@/lib/district-codes';
import { buildNameCandidates } from '@/lib/apt-name-match';
import { normalizeMLTMName } from '@/lib/normalize-mltm-name';
import { isJeonse, type RentTransaction } from '@/lib/rent-shared';
import { representativeArea, type AptGroup, type Transaction } from '@/lib/tx-shared';
import {
  findApartmentIdentity,
  matchesApartmentIdentity,
  type ApartmentIdentity,
} from '@/lib/transaction-identity';

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
  /** 역대 전고점 (apt_highs) — 없거나 불확실하면 최근 조회 기간 값으로 폴백 */
  allTimeHigh: { price: number; dealDate: string } | null;
  /** 대표 면적 최근 전세 계약 (사이클 LL — 전세가율용, 최신순 최대 5건) */
  recentJeonse: RentTransaction[];
  /** 단지 전월세 전체 (전세+월세·전 면적, 최근 APT_RENT_MONTHS개월·최신순) — 전월세 탭용 */
  rentTransactions: RentTransaction[];
  /** 입지 점수 (사이클 MM — analysis 산출물, 106개 주요 단지만) */
  aptScore: AptScore | null;
  /** 원장 조회 성공 여부. ok+빈 배열은 실제 0건, error는 DB 장애다. */
  transactionsStatus: 'ok' | 'error';
  rentStatus: 'ok' | 'error';
  /** apt_highs에는 법정동이 없어 동명 단지가 모호하면 역대값을 쓰지 않는다. */
  allTimeHighStatus: 'ok' | 'ambiguous' | 'error';
}

export const getApartmentById = cache(async (id: string): Promise<Apartment | null> => {
  const rows = await getBlogDb()
    .select()
    .from(apartments)
    .where(eq(apartments.id, id))
    .limit(1);
  return rows[0] ?? null;
});

/** 이번 달 포함 최근 N개월의 시작일 (YYYY-MM-01) — getMonthList 와 동일 창 */
function monthsWindowStart(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - (months - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * generateMetadata와 페이지 본문이 같은 요청에서 공유하는 단지 상세 로더.
 * React cache는 요청 범위에서만 결과를 재사용해 DB 조회를 한 번으로 줄인다.
 */
export const getAptPageData = cache(async (id: string): Promise<AptPageData | null> => {
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
  const normalizedCandidates = [...new Set(
    [...candidates].map(normalizeMLTMName).filter(Boolean),
  )];
  const masterIdentity: ApartmentIdentity = {
    id: master.id,
    name: master.name,
    aliases: master.aliases,
    dong: master.dong,
  };
  const db = getBlogDb();
  let transactionsStatus: AptPageData['transactionsStatus'] = 'ok';

  // 매매 — 단지 식별 조건까지 SQL 에 푸시다운한다. master_id 가 있으면 그것을
  // 최우선으로 신뢰하고, 미매칭(null) 행만 정규화명+법정동으로 보수적으로 폴백한다.
  // 아래 JS 판정도 남겨 DB 오염 시 다른 단지가 섞이지 않게 fail-closed 한다.
  try {
    const fallbackIdentity = master.dong
      ? and(
          isNull(transactions.masterId),
          inArray(transactions.aptNameNorm, normalizedCandidates),
          eq(transactions.umdNm, master.dong),
        )
      : undefined;
    const identityCondition = fallbackIdentity
      ? or(eq(transactions.masterId, master.id), fallbackIdentity)
      : eq(transactions.masterId, master.id);
    const rows = await db
      .select({
        aptName:   transactions.aptName,
        umdNm:     transactions.umdNm,
        areaM2:    transactions.areaM2,
        floor:     transactions.floor,
        price:     transactions.dealAmount,
        dealDate:  transactions.dealDate,
        buildYear: transactions.buildYear,
        masterId:  transactions.masterId,
      })
      .from(transactions)
      .where(and(
        eq(transactions.lawdCd, master.lawdCd),
        gte(transactions.dealDate, monthsWindowStart(APT_PAGE_MONTHS)),
        eq(transactions.isCanceled, false),
        identityCondition,
      ))
      .orderBy(desc(transactions.dealDate));

    for (const r of rows) {
      if (!matchesApartmentIdentity(
        { aptName: r.aptName, dong: r.umdNm, masterId: r.masterId },
        masterIdentity,
      )) continue;
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
    transactionsStatus = 'error';
    console.error('[apt-detail] 매매 원장 조회 실패:', e);
  }

  group.areas.sort((a, b) => a - b);

  // 전월세 (사이클 LL — 전세가율 + 전월세 탭). 이 테이블에는 정규화명과
  // master_id 가 없으므로 같은 법정동의 DISTINCT 단지명만 먼저 가져와 기존
  // 정규화 규칙으로 정확히 매칭한 뒤, 일치한 원문명만 본문 쿼리에 넣는다.
  // 따라서 정규화 호환성을 유지하면서 구 전체 거래 본문 전송을 피한다.
  let recentJeonse: RentTransaction[] = [];
  let rentTransactions: RentTransaction[] = [];
  let rentStatus: AptPageData['rentStatus'] = 'ok';
  try {
    const masterDong = master.dong;
    const rentRows = masterDong
      ? await (async () => {
          const nameRows = await db
            .selectDistinct({ aptName: rentTxTable.aptName })
            .from(rentTxTable)
            .where(and(
              eq(rentTxTable.lawdCd, master.lawdCd),
              gte(rentTxTable.dealDate, monthsWindowStart(APT_RENT_MONTHS)),
              eq(rentTxTable.umdNm, masterDong),
            ));
          const matchedNames = [...new Set(
            nameRows
              .filter((row) => matchesApartmentIdentity(
                { aptName: row.aptName, dong: masterDong },
                masterIdentity,
              ))
              .map((row) => row.aptName),
          )];
          if (matchedNames.length === 0) return [];

          return db
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
              eq(rentTxTable.umdNm, masterDong),
              inArray(rentTxTable.aptName, matchedNames),
            ))
            .orderBy(desc(rentTxTable.dealDate));
        })()
      : [];

    const allRent: RentTransaction[] = rentRows
      .filter((r) => matchesApartmentIdentity(
        { aptName: r.aptName, dong: r.umdNm },
        masterIdentity,
      ))
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
    // 전세가율용 — 대표 면적대(±6㎡) 전세만 최신 5건. 매매가 없어
    // 대표 면적을 정할 수 없는 경우에도 전월세 표 자체는 정상 제공한다.
    if (group.transactions.length > 0) {
      const repArea = representativeArea(group);
      recentJeonse = allRent
        .filter((tx) => isJeonse(tx) && Math.abs(tx.area - repArea) <= 6)
        .slice(0, 5);
    }
  } catch (e) {
    rentStatus = 'error';
    console.error('[apt-detail] 전월세 원장 조회 실패:', e);
  }

  // 역대 전고점 (fail-open) — 대표 면적대(±6㎡) 기준, 거래 없으면 생략
  let allTimeHigh: AptPageData['allTimeHigh'] = null;
  let allTimeHighStatus: AptPageData['allTimeHighStatus'] = 'ok';
  if (group.transactions.length > 0) {
    try {
      const repArea = representativeArea(group);
      const rows = await getBlogDb()
        .select({ aptName: aptHighs.aptName, price: aptHighs.price, dealDate: aptHighs.dealDate })
        .from(aptHighs)
        .where(and(
          eq(aptHighs.district, district),
          inArray(aptHighs.aptName, [...candidates]),
          gte(aptHighs.area, repArea - 6),
          lte(aptHighs.area, repArea + 6),
        ))
        .orderBy(desc(aptHighs.price))
        .limit(50);

      if (rows.length > 0) {
        const masterRows = await getBlogDb()
          .select({
            id: apartments.id,
            name: apartments.name,
            aliases: apartments.aliases,
            dong: apartments.dong,
          })
          .from(apartments)
          .where(eq(apartments.lawdCd, master.lawdCd));
        const identities: ApartmentIdentity[] = masterRows.map((row) => ({
          id: row.id,
          name: row.name,
          aliases: row.aliases,
          dong: row.dong,
        }));
        const exact = rows.find((row) =>
          findApartmentIdentity({ aptName: row.aptName }, identities)?.id === master.id,
        );
        if (exact) {
          allTimeHigh = { price: exact.price, dealDate: exact.dealDate };
        } else {
          allTimeHighStatus = 'ambiguous';
        }
      }
    } catch (e) {
      allTimeHighStatus = 'error';
      console.error('[apt-detail] apt_highs 조회 실패:', e);
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

  return {
    master,
    district,
    group,
    allTimeHigh,
    recentJeonse,
    rentTransactions,
    aptScore,
    transactionsStatus,
    rentStatus,
    allTimeHighStatus,
  };
});
