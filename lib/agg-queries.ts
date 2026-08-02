/**
 * 실거래 집계 SQL 푸시다운 — 집계 3종(summary·districts·highlights) 공용.
 *
 * 배경(2026-08-02, Neon 전송량 사고 재발 방지): 기존 집계는 윈도우 내
 * 원장 행 전체(수만~수십만)를 매 콜 전송해 JS로 집계했다 — 무료 5GB/월
 * 소진의 주범. 여기서는 집계를 Postgres 안에서 끝내고 결과(구 단위
 * 수백 행 / 하이라이트 수십 행)만 전송한다.
 *
 * 신고가 판정은 lib/summary-highs.ts(countNewHighs)와 동일 의미론:
 *   동일 시군구+단지+면적(반올림) 그룹에서 거래 2건 이상 &&
 *   최신(계약일) 거래가가 이전 모든 거래가를 초과.
 *   같은 날 복수 거래는 높은 가격을 최신으로 간주(결정적 tie-break).
 *
 * raw neon() 사용 — drizzle.execute() 결과 형식 이슈 회피 (health/db 와
 * 동일 패턴). 값 삽입은 태그드 템플릿 파라미터라 인젝션 없음.
 */
import { neon } from '@neondatabase/serverless';

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('[agg-queries] DATABASE_URL 환경변수 미설정');
  return neon(url);
}

export interface DistrictAggRow {
  sigungu:  string;
  cnt:      number;
  newHighs: number;
  /** 만원 합계 — float8 캐스팅 (bigint 문자열 반환 회피, 2^53 내 안전) */
  sum59:    number;
  cnt59:    number;
  sum84:    number;
  cnt84:    number;
}

/**
 * 구별 집계 (건수·신고가·59/84 가격 합계) — summary·districts 공용.
 * 전송량: 시군구 수만큼(≤ ~250행).
 */
export async function fetchDistrictAggs(from: string, to: string): Promise<DistrictAggRow[]> {
  const sql = sqlClient();
  const rows = (await sql`
    WITH w AS (
      SELECT sigungu, apt_name, round(area_m2::numeric)::int AS area_r, area_m2, deal_amount, deal_date
        FROM transactions
       WHERE deal_date >= ${from} AND deal_date < ${to} AND is_canceled = false
    ),
    ranked AS (
      -- 신고가 판정용 유효 행만 (countNewHighs 의 !aptName·!price·!area 스킵과 동일)
      SELECT sigungu, apt_name, area_r, deal_amount,
             row_number() OVER (
               PARTITION BY sigungu, apt_name, area_r
               ORDER BY deal_date DESC, deal_amount DESC
             ) AS rn
        FROM w
       WHERE apt_name <> '' AND deal_amount > 0 AND area_r > 0
    ),
    apt_stats AS (
      SELECT sigungu, apt_name, area_r,
             count(*)                                  AS n,
             max(deal_amount) FILTER (WHERE rn = 1)    AS latest_amt,
             max(deal_amount) FILTER (WHERE rn > 1)    AS prior_max
        FROM ranked
       GROUP BY sigungu, apt_name, area_r
    ),
    highs AS (
      SELECT sigungu, count(*)::int AS new_highs
        FROM apt_stats
       WHERE n >= 2 AND latest_amt > prior_max
       GROUP BY sigungu
    ),
    aggs AS (
      SELECT sigungu,
             count(*)::int AS cnt,
             coalesce(sum(deal_amount) FILTER (WHERE area_m2 BETWEEN 55 AND 63), 0)::float8 AS sum59,
             count(*)          FILTER (WHERE area_m2 BETWEEN 55 AND 63)::int                AS cnt59,
             coalesce(sum(deal_amount) FILTER (WHERE area_m2 BETWEEN 80 AND 88), 0)::float8 AS sum84,
             count(*)          FILTER (WHERE area_m2 BETWEEN 80 AND 88)::int                AS cnt84
        FROM w
       GROUP BY sigungu
    )
    SELECT a.sigungu,
           a.cnt,
           coalesce(h.new_highs, 0)::int AS "newHighs",
           a.sum59, a.cnt59, a.sum84, a.cnt84
      FROM aggs a
      LEFT JOIN highs h USING (sigungu)
  `) as Array<{
    sigungu: string; cnt: number; newHighs: number;
    sum59: number; cnt59: number; sum84: number; cnt84: number;
  }>;
  return rows;
}

/**
 * 분양권 구별 집계 — summary 유형 탭용 (2026-08-02, silv_transactions 원장 신설).
 * 의미론은 매매(fetchDistrictAggs)와 동일 (신고가 포함, 취소 제외).
 */
export async function fetchSilvDistrictAggs(from: string, to: string): Promise<DistrictAggRow[]> {
  const sql = sqlClient();
  const rows = (await sql`
    WITH w AS (
      SELECT sigungu, apt_name, round(area_m2::numeric)::int AS area_r, area_m2, deal_amount, deal_date
        FROM silv_transactions
       WHERE deal_date >= ${from} AND deal_date < ${to} AND is_canceled = false
    ),
    ranked AS (
      SELECT sigungu, apt_name, area_r, deal_amount,
             row_number() OVER (
               PARTITION BY sigungu, apt_name, area_r
               ORDER BY deal_date DESC, deal_amount DESC
             ) AS rn
        FROM w
       WHERE apt_name <> '' AND deal_amount > 0 AND area_r > 0
    ),
    apt_stats AS (
      SELECT sigungu, apt_name, area_r,
             count(*)                                  AS n,
             max(deal_amount) FILTER (WHERE rn = 1)    AS latest_amt,
             max(deal_amount) FILTER (WHERE rn > 1)    AS prior_max
        FROM ranked
       GROUP BY sigungu, apt_name, area_r
    ),
    highs AS (
      SELECT sigungu, count(*)::int AS new_highs
        FROM apt_stats
       WHERE n >= 2 AND latest_amt > prior_max
       GROUP BY sigungu
    ),
    aggs AS (
      SELECT sigungu,
             count(*)::int AS cnt,
             coalesce(sum(deal_amount) FILTER (WHERE area_m2 BETWEEN 55 AND 63), 0)::float8 AS sum59,
             count(*)          FILTER (WHERE area_m2 BETWEEN 55 AND 63)::int                AS cnt59,
             coalesce(sum(deal_amount) FILTER (WHERE area_m2 BETWEEN 80 AND 88), 0)::float8 AS sum84,
             count(*)          FILTER (WHERE area_m2 BETWEEN 80 AND 88)::int                AS cnt84
        FROM w
       GROUP BY sigungu
    )
    SELECT a.sigungu,
           a.cnt,
           coalesce(h.new_highs, 0)::int AS "newHighs",
           a.sum59, a.cnt59, a.sum84, a.cnt84
      FROM aggs a
      LEFT JOIN highs h USING (sigungu)
  `) as Array<{
    sigungu: string; cnt: number; newHighs: number;
    sum59: number; cnt59: number; sum84: number; cnt84: number;
  }>;
  return rows;
}

export interface RentDistrictAggRow {
  sigungu: string;
  cnt:     number;
  /** 보증금 합계 (만원) — float8 캐스팅 */
  sumDep59:  number;
  cnt59:     number;
  sumDep84:  number;
  cnt84:     number;
  /** 월세 합계 (만원) — 월세(kind='monthly') 집계에서만 의미 */
  sumRent59: number;
  sumRent84: number;
}

/**
 * 전월세 구별 집계 (건수·59/84 보증금·월세 합계) — summary 유형 탭용 (2026-08-02).
 * kind='jeonse' 는 monthly_rent = 0, 'monthly' 는 > 0 (rent-shared 분류와 동일).
 * rent_transactions 엔 취소 개념 없음. 전송량: 시군구 수만큼(≤ ~250행).
 */
export async function fetchRentDistrictAggs(
  from: string,
  to: string,
  kind: 'jeonse' | 'monthly',
): Promise<RentDistrictAggRow[]> {
  const sql = sqlClient();
  const rows = (await sql`
    SELECT sigungu,
           count(*)::int AS cnt,
           coalesce(sum(deposit) FILTER (WHERE area_m2 BETWEEN 55 AND 63), 0)::float8      AS "sumDep59",
           count(*)              FILTER (WHERE area_m2 BETWEEN 55 AND 63)::int             AS cnt59,
           coalesce(sum(deposit) FILTER (WHERE area_m2 BETWEEN 80 AND 88), 0)::float8      AS "sumDep84",
           count(*)              FILTER (WHERE area_m2 BETWEEN 80 AND 88)::int             AS cnt84,
           coalesce(sum(monthly_rent) FILTER (WHERE area_m2 BETWEEN 55 AND 63), 0)::float8 AS "sumRent59",
           coalesce(sum(monthly_rent) FILTER (WHERE area_m2 BETWEEN 80 AND 88), 0)::float8 AS "sumRent84"
      FROM rent_transactions
     WHERE deal_date >= ${from} AND deal_date < ${to}
       AND (monthly_rent = 0) = ${kind === 'jeonse'}
     GROUP BY sigungu
  `) as unknown as RentDistrictAggRow[];
  return rows;
}

/** 하이라이트 공통 행 (가공 전 — 일자 '-00' 처리·floor 폴백은 호출부 몫) */
export interface RawHighlightRow {
  sigungu:  string;
  aptName:  string;
  area:     number;
  floor:    number | null;
  price:    number;
  dealDate: string;
  prevHigh?:  number;
  prevPrice?: number;
}

/**
 * 하이라이트 3종 (신고가·급등·국평 고가) — 각 최대 perCategory 행만 전송.
 * 선정 로직은 기존 highlights 라우트 JS 와 동일 의미론 (신고가는 >=,
 * 급등은 직전(2번째 최신) 대비 상승, 국평은 반올림 80~88㎡ 단지당 최고가).
 */
export async function fetchHighlightLists(
  from: string,
  to: string,
  perCategory: number,
): Promise<{ newHighs: RawHighlightRow[]; surges: RawHighlightRow[]; pyeong84: RawHighlightRow[] }> {
  const sql = sqlClient();

  const newHighsQ = sql`
    WITH w AS (
      SELECT sigungu, apt_name, round(area_m2::numeric)::int AS area_r, floor, deal_amount, deal_date
        FROM transactions
       WHERE deal_date >= ${from} AND deal_date < ${to} AND is_canceled = false
    ),
    ranked AS (
      SELECT *,
             row_number() OVER (
               PARTITION BY sigungu, apt_name, area_r
               ORDER BY deal_date DESC, deal_amount DESC
             ) AS rn,
             count(*) OVER (PARTITION BY sigungu, apt_name, area_r) AS n
        FROM w
    ),
    prior AS (
      SELECT sigungu, apt_name, area_r,
             max(deal_amount) FILTER (WHERE rn > 1) AS prev_high
        FROM ranked
       GROUP BY sigungu, apt_name, area_r
    )
    SELECT r.sigungu, r.apt_name AS "aptName", r.area_r AS area, r.floor,
           r.deal_amount AS price, r.deal_date AS "dealDate",
           p.prev_high AS "prevHigh"
      FROM ranked r
      JOIN prior p USING (sigungu, apt_name, area_r)
     WHERE r.rn = 1 AND r.n >= 2 AND r.deal_amount >= p.prev_high
     ORDER BY r.deal_amount DESC
     LIMIT ${perCategory}
  `;

  const surgesQ = sql`
    WITH w AS (
      SELECT sigungu, apt_name, round(area_m2::numeric)::int AS area_r, floor, deal_amount, deal_date
        FROM transactions
       WHERE deal_date >= ${from} AND deal_date < ${to} AND is_canceled = false
    ),
    ranked AS (
      SELECT *,
             row_number() OVER (
               PARTITION BY sigungu, apt_name, area_r
               ORDER BY deal_date DESC, deal_amount DESC
             ) AS rn
        FROM w
    )
    SELECT r1.sigungu, r1.apt_name AS "aptName", r1.area_r AS area, r1.floor,
           r1.deal_amount AS price, r1.deal_date AS "dealDate",
           r2.deal_amount AS "prevPrice"
      FROM ranked r1
      JOIN ranked r2
        ON r2.sigungu = r1.sigungu AND r2.apt_name = r1.apt_name AND r2.area_r = r1.area_r
     WHERE r1.rn = 1 AND r2.rn = 2
       AND r2.deal_amount > 0 AND r1.deal_amount > r2.deal_amount
     ORDER BY (r1.deal_amount - r2.deal_amount)::float8 / r2.deal_amount DESC
     LIMIT ${perCategory}
  `;

  const pyeong84Q = sql`
    WITH w AS (
      SELECT sigungu, apt_name, round(area_m2::numeric)::int AS area_r, floor, deal_amount, deal_date
        FROM transactions
       WHERE deal_date >= ${from} AND deal_date < ${to} AND is_canceled = false
         AND round(area_m2::numeric)::int BETWEEN 80 AND 88
    ),
    dedup AS (
      SELECT DISTINCT ON (sigungu, apt_name)
             sigungu, apt_name, area_r, floor, deal_amount, deal_date
        FROM w
       ORDER BY sigungu, apt_name, deal_amount DESC
    )
    SELECT sigungu, apt_name AS "aptName", area_r AS area, floor,
           deal_amount AS price, deal_date AS "dealDate"
      FROM dedup
     ORDER BY deal_amount DESC
     LIMIT ${perCategory}
  `;

  const [newHighs, surges, pyeong84] = await Promise.all([newHighsQ, surgesQ, pyeong84Q]);
  return {
    newHighs: newHighs as unknown as RawHighlightRow[],
    surges:   surges   as unknown as RawHighlightRow[],
    pyeong84: pyeong84 as unknown as RawHighlightRow[],
  };
}
