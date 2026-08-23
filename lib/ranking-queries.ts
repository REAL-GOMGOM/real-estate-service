import { neon } from '@neondatabase/serverless';
import { kstTodayIso, shiftDays } from '@/lib/agg-window';

export type RankingArea = 'all' | '59' | '84' | 'large';

export const RANKING_TOTAL_LABEL = '등록 표본 전체';

export const RANKING_REGION_NAMES: Record<string, string> = {
  ALL: RANKING_TOTAL_LABEL,
  '11': '서울특별시',
  '26': '부산광역시',
  '27': '대구광역시',
  '28': '인천광역시',
  GJ: '광주광역시',
  '30': '대전광역시',
  '31': '울산광역시',
  '36': '세종특별자치시',
  '41': '경기도',
  GW: '강원특별자치도',
  '43': '충청북도',
  '44': '충청남도',
  JB: '전북특별자치도',
  JN: '전라남도',
  '47': '경상북도',
  '48': '경상남도',
  '50': '제주특별자치도',
};

export interface RankingCoverageRow {
  transactionCount: number;
  districtCount: number;
  firstDealDate: string | null;
  lastDealDate: string | null;
}

export interface RankingTopPriceRow {
  regionCode: string;
  rank: number;
  aptName: string;
  district: string;
  dong: string;
  price: number;
  area: number;
  floor: number | null;
  dealDate: string;
}

export interface RankingVolumeRow {
  regionCode: string;
  rank: number;
  aptName: string;
  district: string;
  dong: string;
  count: number;
  avgPrice: number;
}

export interface RankingNewHighRow {
  regionCode: string;
  rank: number;
  aptName: string;
  district: string;
  dong: string;
  price: number;
  prevHigh: number;
  diff: number;
  diffPercent: number;
}

export interface RankingTradeStats {
  coverage: RankingCoverageRow;
  topPrice: RankingTopPriceRow[];
  volume: RankingVolumeRow[];
  newHigh: RankingNewHighRow[];
}

function sqlClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('[ranking] DATABASE_URL 환경변수 미설정');
  return neon(url);
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** KST 오늘을 포함하는 rolling N개월 조회 범위. */
export function rankingWindow(periodMonths: 3 | 12, now = new Date()) {
  const today = kstTodayIso(now);
  const [year, month, day] = today.split('-').map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 - periodMonths, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay));
  return {
    from: formatUtcDate(targetMonth),
    toExclusive: shiftDays(today, 1),
    asOf: today,
  };
}

export type RankingQueryExecutor = <Row>(
  text: string,
  values: readonly unknown[],
) => Promise<readonly Row[]>;

export const RANKING_COVERAGE_SELECT = `
    SELECT count(*)::int AS "transactionCount",
           count(DISTINCT lawd_cd)::int AS "districtCount",
           min(deal_date) AS "firstDealDate",
           max(deal_date) AS "lastDealDate"
      FROM transactions
     WHERE deal_date >= $1 AND deal_date < $2
       AND is_canceled = false
       AND right(deal_date, 2) <> '00'
       AND ($3 = 'all'
         OR ($3 = '59' AND area_m2 >= 57 AND area_m2 < 62)
         OR ($3 = '84' AND area_m2 >= 82 AND area_m2 < 87)
         OR ($3 = 'large' AND area_m2 >= 87))
`;

export const RANKING_TOP_PRICE_SELECT = `
    WITH filtered AS (
      SELECT CASE
               WHEN left(lawd_cd, 2) IN ('29')
                 OR (left(lawd_cd, 2) = '12' AND sigungu LIKE '광주 %') THEN 'GJ'
               WHEN left(lawd_cd, 2) IN ('46', '12') THEN 'JN'
               WHEN left(lawd_cd, 2) IN ('42', '51') THEN 'GW'
               WHEN left(lawd_cd, 2) IN ('45', '52') THEN 'JB'
               ELSE left(lawd_cd, 2)
             END AS region_code,
             sigungu, umd_nm, apt_name, deal_amount, area_m2, floor, deal_date
        FROM transactions
       WHERE deal_date >= $1 AND deal_date < $2
         AND is_canceled = false
         AND right(deal_date, 2) <> '00'
         AND ($3 = 'all'
           OR ($3 = '59' AND area_m2 >= 57 AND area_m2 < 62)
           OR ($3 = '84' AND area_m2 >= 82 AND area_m2 < 87)
           OR ($3 = 'large' AND area_m2 >= 87))
    ), expanded AS (
      SELECT * FROM filtered
      UNION ALL
      SELECT 'ALL' AS region_code, sigungu, umd_nm, apt_name, deal_amount, area_m2, floor, deal_date
        FROM filtered
    ), ranked AS (
      SELECT *, row_number() OVER (
        PARTITION BY region_code ORDER BY deal_amount DESC, deal_date DESC, apt_name
      ) AS rn
        FROM expanded
    )
    SELECT region_code AS "regionCode", rn::int AS rank,
           apt_name AS "aptName", sigungu AS district, umd_nm AS dong,
           deal_amount AS price, area_m2 AS area, floor, deal_date AS "dealDate"
     FROM ranked
     WHERE rn <= 5
     ORDER BY region_code, rn
`;

export const RANKING_VOLUME_SELECT = `
    WITH filtered AS (
      SELECT CASE
               WHEN left(lawd_cd, 2) IN ('29')
                 OR (left(lawd_cd, 2) = '12' AND sigungu LIKE '광주 %') THEN 'GJ'
               WHEN left(lawd_cd, 2) IN ('46', '12') THEN 'JN'
               WHEN left(lawd_cd, 2) IN ('42', '51') THEN 'GW'
               WHEN left(lawd_cd, 2) IN ('45', '52') THEN 'JB'
               ELSE left(lawd_cd, 2)
             END AS region_code,
             sigungu, umd_nm, apt_name, deal_amount
        FROM transactions
       WHERE deal_date >= $1 AND deal_date < $2
         AND is_canceled = false
         AND right(deal_date, 2) <> '00'
         AND ($3 = 'all'
           OR ($3 = '59' AND area_m2 >= 57 AND area_m2 < 62)
           OR ($3 = '84' AND area_m2 >= 82 AND area_m2 < 87)
           OR ($3 = 'large' AND area_m2 >= 87))
    ), expanded AS (
      SELECT * FROM filtered
      UNION ALL
      SELECT 'ALL' AS region_code, sigungu, umd_nm, apt_name, deal_amount FROM filtered
    ), grouped AS (
      SELECT region_code, sigungu, umd_nm, apt_name,
             count(*)::int AS tx_count,
             round(avg(deal_amount))::int AS avg_price
        FROM expanded
       GROUP BY region_code, sigungu, umd_nm, apt_name
    ), ranked AS (
      SELECT *, row_number() OVER (
        PARTITION BY region_code ORDER BY tx_count DESC, avg_price DESC, apt_name
      ) AS rn
        FROM grouped
    )
    SELECT region_code AS "regionCode", rn::int AS rank,
           apt_name AS "aptName", sigungu AS district, umd_nm AS dong,
           tx_count AS count, avg_price AS "avgPrice"
     FROM ranked
     WHERE rn <= 5
     ORDER BY region_code, rn
`;

export const RANKING_NEW_HIGH_SELECT = `
    WITH latest AS (
      SELECT DISTINCT ON (lawd_cd, sigungu, umd_nm, apt_name, area_r)
             CASE
               WHEN left(lawd_cd, 2) IN ('29')
                 OR (left(lawd_cd, 2) = '12' AND sigungu LIKE '광주 %') THEN 'GJ'
               WHEN left(lawd_cd, 2) IN ('46', '12') THEN 'JN'
               WHEN left(lawd_cd, 2) IN ('42', '51') THEN 'GW'
               WHEN left(lawd_cd, 2) IN ('45', '52') THEN 'JB'
               ELSE left(lawd_cd, 2)
             END AS region_code,
             lawd_cd, sigungu, umd_nm, apt_name, area_r, deal_amount, deal_date
        FROM (
          SELECT lawd_cd, sigungu, umd_nm, apt_name, round(area_m2::numeric)::int AS area_r,
                 deal_amount, deal_date
            FROM transactions
           WHERE deal_date >= $1 AND deal_date < $2
             AND is_canceled = false
             AND right(deal_date, 2) <> '00'
             AND ($3 = 'all'
               OR ($3 = '59' AND area_m2 >= 57 AND area_m2 < 62)
               OR ($3 = '84' AND area_m2 >= 82 AND area_m2 < 87)
               OR ($3 = 'large' AND area_m2 >= 87))
        ) recent
       ORDER BY lawd_cd, sigungu, umd_nm, apt_name, area_r, deal_date DESC, deal_amount DESC
    ), with_prior AS (
      SELECT l.region_code, l.lawd_cd, l.sigungu, l.umd_nm, l.apt_name, l.area_r,
             l.deal_amount, l.deal_date, max(t.deal_amount) AS prev_high
        FROM latest l
        JOIN transactions t
         ON t.lawd_cd = l.lawd_cd
         AND t.sigungu = l.sigungu
         AND t.umd_nm = l.umd_nm
         AND t.apt_name = l.apt_name
         AND round(t.area_m2::numeric)::int = l.area_r
         AND t.is_canceled = false
         AND right(t.deal_date, 2) <> '00'
         AND t.deal_date < l.deal_date
       GROUP BY l.region_code, l.lawd_cd, l.sigungu, l.umd_nm, l.apt_name, l.area_r, l.deal_amount, l.deal_date
    ), highs AS (
      SELECT *, deal_amount - prev_high AS diff,
             ((deal_amount - prev_high)::float8 / prev_high * 100) AS diff_pct
        FROM with_prior
       WHERE deal_amount > prev_high
    ), expanded AS (
      SELECT region_code, sigungu, umd_nm, apt_name, area_r, deal_amount, deal_date, prev_high, diff, diff_pct FROM highs
      UNION ALL
      SELECT 'ALL' AS region_code, sigungu, umd_nm, apt_name, area_r,
             deal_amount, deal_date, prev_high, diff, diff_pct
        FROM highs
    ), ranked AS (
      SELECT *, row_number() OVER (
        PARTITION BY region_code ORDER BY diff DESC, deal_date DESC, apt_name
      ) AS rn
        FROM expanded
    )
    SELECT region_code AS "regionCode", rn::int AS rank,
           apt_name AS "aptName", sigungu AS district, umd_nm AS dong,
           deal_amount AS price, prev_high AS "prevHigh", diff,
           round(diff_pct::numeric, 1)::float8 AS "diffPercent"
     FROM ranked
     WHERE rn <= 5
     ORDER BY region_code, rn
`;

/**
 * 취소 거래를 제외한 자체 실거래 원장에서 랭킹용 소량 집계행만 가져온다.
 * HTTP Neon과 Mac mini의 pg client가 같은 SQL 의미론을 공유하도록 executor를 주입한다.
 */
export async function fetchRankingTradeStatsWithExecutor(
  execute: RankingQueryExecutor,
  from: string,
  toExclusive: string,
  area: RankingArea,
): Promise<RankingTradeStats> {
  const values = [from, toExclusive, area] as const;

  // A publisher runs these reads inside one repeatable-read pg transaction.
  // Keep them sequential so a single pg client never receives overlapping queries.
  const coverageRows = await execute<RankingCoverageRow>(RANKING_COVERAGE_SELECT, values);
  const topPrice = await execute<RankingTopPriceRow>(RANKING_TOP_PRICE_SELECT, values);
  const volume = await execute<RankingVolumeRow>(RANKING_VOLUME_SELECT, values);
  const newHigh = await execute<RankingNewHighRow>(RANKING_NEW_HIGH_SELECT, values);

  const coverage = (coverageRows[0] ?? {
    transactionCount: 0,
    districtCount: 0,
    firstDealDate: null,
    lastDealDate: null,
  }) as unknown as RankingCoverageRow;

  return {
    coverage,
    topPrice: [...topPrice],
    volume: [...volume],
    newHigh: [...newHigh],
  };
}

export async function fetchRankingTradeStats(
  from: string,
  toExclusive: string,
  area: RankingArea,
): Promise<RankingTradeStats> {
  const sql = sqlClient();
  return fetchRankingTradeStatsWithExecutor(
    async <Row>(text: string, values: readonly unknown[]) => (
      await sql.query(text, [...values]) as unknown as Row[]
    ),
    from,
    toExclusive,
    area,
  );
}
