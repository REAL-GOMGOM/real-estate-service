import { config } from 'dotenv';
config({ path: '.env.local' });

import { resolveAggWindow } from '../lib/agg-window';
import { fetchRentDistrictAggs } from '../lib/agg-queries';
import { DISTRICT_GROUPS } from '../lib/district-groups';

/**
 * 전월세 시/도 집계 스모크 검증 (2026-08-02 유형 탭 확장 검증용).
 *
 *   실행:    npx tsx scripts/verify-rent-agg.ts
 *   월 지정: npx tsx scripts/verify-rent-agg.ts --window=202607
 *
 * 확인 항목:
 *   - 전세/월세 각각 구 수·총 건수·상위 3개 구 표본
 *   - 불변식: 전세(monthly_rent=0) 집계의 월세 합은 0
 *   - 시군구 명칭이 DISTRICT_GROUPS 와 매칭되는지 (미매칭 = 시도 합산 누락)
 */
async function main() {
  const windowArg = process.argv.find((a) => a.startsWith('--window='))?.slice(9) ?? null;
  const w = resolveAggWindow(windowArg);
  if (!w) { console.error('잘못된 --window (rolling30 | YYYYMM)'); process.exit(1); }
  console.log(`window: ${w.from} → ${w.to} (${w.type})`);

  let ok = true;
  for (const kind of ['jeonse', 'monthly'] as const) {
    const rows = await fetchRentDistrictAggs(w.from, w.to, kind);
    const cnt = rows.reduce((s, r) => s + r.cnt, 0);
    const top = [...rows].sort((a, b) => b.cnt - a.cnt).slice(0, 3);
    console.log(`\n[${kind}] 구 수: ${rows.length} | 총 건수: ${cnt.toLocaleString()}`);
    for (const r of top) {
      const avgDep59  = r.cnt59 ? Math.round(r.sumDep59 / r.cnt59) : null;
      const avgRent59 = r.cnt59 ? Math.round(r.sumRent59 / r.cnt59) : null;
      console.log(
        `  ${r.sigungu}: ${r.cnt.toLocaleString()}건, 59㎡ 보증금 평균 ${avgDep59?.toLocaleString()}만` +
        (kind === 'monthly' ? ` / 월세 평균 ${avgRent59?.toLocaleString()}만` : ''),
      );
    }
    if (kind === 'jeonse') {
      const rentSum = rows.reduce((s, r) => s + r.sumRent59 + r.sumRent84, 0);
      if (rentSum !== 0) { console.error(`  ✗ 전세 집계에 월세 합 존재: ${rentSum}`); ok = false; }
      else console.log('  ✓ 전세 집계 월세 합 0 (불변식 통과)');
    }
    if (cnt === 0) { console.error(`  ✗ [${kind}] 총 건수 0 — 윈도우·데이터 확인 필요`); ok = false; }

    // 미매칭 구는 시도 카드 합산에서 빠진다 — 매매 집계도 동일 패턴(서비스 대상
    // 구 목록 기준)이라 정보성 출력만. 비율이 급증하면 명칭 드리프트 의심.
    const known = new Set(DISTRICT_GROUPS.flatMap((g) => g.districts));
    const miss = rows.filter((r) => !known.has(r.sigungu));
    const missCnt = miss.reduce((s, r) => s + r.cnt, 0);
    console.log(`  ℹ DISTRICT_GROUPS 미매칭 구 ${miss.length}개 (시도 합산 제외 ${missCnt.toLocaleString()}건 / ${cnt.toLocaleString()}건) — 매매와 동일 패턴`);
  }
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
