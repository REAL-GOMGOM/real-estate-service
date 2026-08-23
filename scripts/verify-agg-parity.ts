import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { countNewHighs, type SummaryDeal } from '../lib/summary-highs';
import { resolveAggWindow } from '../lib/agg-window';
import { fetchDistrictAggs } from '../lib/agg-queries';

/**
 * 집계 푸시다운 패리티 검증 — 로컬 1회 실행 (2026-08-02 전환 검증용).
 *
 * 기존 방식(원장 행 전체 전송 → JS 집계)과 신규 방식(SQL 푸시다운,
 * lib/agg-queries.fetchDistrictAggs)을 같은 윈도우로 돌려 구별로 대조한다.
 *
 *   실행:        npx tsx scripts/verify-agg-parity.ts
 *   월 지정:     npx tsx scripts/verify-agg-parity.ts --window=202607
 *
 * 판정 기준:
 *   - cnt·avg59·avg84 : 정확 일치해야 함 (불일치 시 exit 1)
 *   - newHighs        : 같은 날 복수 거래 tie-break 가 JS(입력 순서 의존)와
 *                       SQL(높은 가격 우선, 결정적)이 다를 수 있어 소폭 차이 허용.
 *                       차이 나는 구는 전부 출력하니 눈으로 확인할 것.
 */

interface OldAgg { cnt: number; newHighs: number; avg59: number | null; avg84: number | null }

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
}

async function main() {
  const windowArg = process.argv.find((a) => a.startsWith('--window='))?.split('=')[1] ?? null;
  const window = resolveAggWindow(windowArg);
  if (!window) throw new Error(`잘못된 --window 값: ${windowArg}`);
  console.log(`[parity] 윈도우: ${window.type} ${window.from} ~ ${window.to} (상한 배타)`);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 미설정 (.env.local 확인)');
  const sql = neon(url);

  // ── 기존 방식: 원장 행 전체 → JS 집계 (summary 라우트 7/19 버전 로직 그대로) ──
  const started = Date.now();
  const rows = (await sql`
    SELECT sigungu, apt_name AS "aptName", area_m2 AS "areaM2",
           deal_amount AS price, deal_date AS "dealDate"
      FROM transactions
     WHERE deal_date >= ${window.from} AND deal_date < ${window.to} AND is_canceled = false
  `) as Array<{ sigungu: string; aptName: string; areaM2: number; price: number; dealDate: string }>;
  console.log(`[parity] 기존 방식 행 전송: ${rows.length.toLocaleString()}행 (${Date.now() - started}ms) ← 이게 매 콜마다 나가던 전송량`);

  const oldByDistrict = new Map<string, { cnt: number; p59: number[]; p84: number[]; deals: SummaryDeal[] }>();
  for (const r of rows) {
    let e = oldByDistrict.get(r.sigungu);
    if (!e) { e = { cnt: 0, p59: [], p84: [], deals: [] }; oldByDistrict.set(r.sigungu, e); }
    e.cnt++;
    if (r.areaM2 >= 55 && r.areaM2 <= 63) e.p59.push(r.price);
    if (r.areaM2 >= 80 && r.areaM2 <= 88) e.p84.push(r.price);
    e.deals.push({ aptName: r.aptName, area: r.areaM2, price: r.price, date: r.dealDate.replace(/-/g, '') });
  }
  const oldAggs = new Map<string, OldAgg>();
  oldByDistrict.forEach((e, sigungu) => {
    oldAggs.set(sigungu, { cnt: e.cnt, newHighs: countNewHighs(e.deals), avg59: avg(e.p59), avg84: avg(e.p84) });
  });

  // ── 신규 방식: SQL 푸시다운 ──
  const started2 = Date.now();
  const newRows = await fetchDistrictAggs(window.from, window.to);
  console.log(`[parity] 신규 방식 행 전송: ${newRows.length.toLocaleString()}행 (${Date.now() - started2}ms)`);

  // ── 대조 ──
  let hardFail = 0;
  let highDiff = 0;
  const districts = new Set([...oldAggs.keys(), ...newRows.map((r) => r.sigungu)]);
  for (const d of [...districts].sort()) {
    const o = oldAggs.get(d);
    const n = newRows.find((r) => r.sigungu === d);
    const nAvg59 = n && n.cnt59 > 0 ? Math.round(n.sum59 / n.cnt59) : null;
    const nAvg84 = n && n.cnt84 > 0 ? Math.round(n.sum84 / n.cnt84) : null;

    if (!o || !n) {
      console.error(`  ✗ ${d}: 한쪽에만 존재 (old=${!!o} new=${!!n})`);
      hardFail++;
      continue;
    }
    if (o.cnt !== n.cnt || o.avg59 !== nAvg59 || o.avg84 !== nAvg84) {
      console.error(
        `  ✗ ${d}: cnt ${o.cnt}→${n.cnt} · avg59 ${o.avg59}→${nAvg59} · avg84 ${o.avg84}→${nAvg84}`,
      );
      hardFail++;
    }
    if (o.newHighs !== n.newHighs) {
      console.warn(`  ~ ${d}: 신고가 ${o.newHighs}→${n.newHighs} (tie-break 차이 가능 — 확인 요망)`);
      highDiff++;
    }
  }

  const oldTotal = [...oldAggs.values()].reduce((s, v) => s + v.cnt, 0);
  const newTotal = newRows.reduce((s, v) => s + v.cnt, 0);
  console.log(`[parity] 총건수 old=${oldTotal.toLocaleString()} new=${newTotal.toLocaleString()} · 구 ${districts.size}개`);
  console.log(`[parity] 결과 — 하드 불일치 ${hardFail}건 · 신고가 차이 ${highDiff}건`);

  if (hardFail > 0) {
    console.error('[parity] 실패 — cnt/avg 불일치는 있어선 안 됩니다. 전환 중단하고 원인 확인.');
    process.exit(1);
  }
  console.log('[parity] 통과 — cnt·avg 완전 일치. 신고가 차이는 tie-break 목록만 눈으로 확인하면 됩니다.');
}

main().catch((err) => {
  console.error('[parity] 실패:', err);
  process.exit(1);
});
