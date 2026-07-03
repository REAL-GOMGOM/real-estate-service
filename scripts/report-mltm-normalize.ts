import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { normalizeMLTMName } from '../lib/normalize-mltm-name';

/**
 * "실거래 데이터 품질" Phase 1 검증 리포트 (읽기 전용).
 *
 * MOLIT 실거래 API 샘플(서울 3구 × 최근 1개월)의 aptNm을 정제해
 *  (a) 정제로 이름이 바뀌는 목록
 *  (b) 정제 후 같은 이름으로 병합되는 그룹 (동 표기로 쪼개졌던 단지)
 *  (c) apartments 마스터 매칭 전/후 개선
 * 을 출력한다. Phase 2(DB 보강) 진행 판단 자료.
 *
 * 실행: npx tsx scripts/report-mltm-normalize.ts
 */
const DISTRICTS = [
  { name: '강남구', lawdCd: '11680' },
  { name: '서초구', lawdCd: '11650' },
  { name: '송파구', lawdCd: '11710' },
];

function prevMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function fetchAptNames(apiKey: string, lawdCd: string, yyyymm: string): Promise<string[]> {
  const url =
    `https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev` +
    `?serviceKey=${apiKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}&pageNo=1&numOfRows=1000`;
  const xml = await fetch(url).then((r) => r.text());
  const names = [...xml.matchAll(/<aptNm>([^<]*)<\/aptNm>/g)].map((m) => m[1].trim());
  return names;
}

async function main() {
  const apiKey = process.env.MOLIT_API_KEY ?? process.env.DATA_GO_KR_API_KEY;
  const dbUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!apiKey) { console.error('[report] MOLIT_API_KEY 미설정'); process.exit(1); }
  if (!dbUrl) { console.error('[report] DATABASE_URL_UNPOOLED 미설정'); process.exit(1); }

  const sql = neon(dbUrl);
  const master = (await sql`SELECT name FROM apartments`) as Array<{ name: string }>;
  const masterSet = new Set(master.map((m) => m.name.replace(/\s/g, '')));
  const matchMaster = (n: string) => masterSet.has(n.replace(/\s/g, ''));

  const yyyymm = prevMonth();
  console.log(`[report] 기준월 ${yyyymm} · apartments 마스터 ${master.length}건\n`);

  let totalRaw = 0;
  let totalChanged = 0;
  let matchBefore = 0;
  let matchAfter = 0;

  for (const d of DISTRICTS) {
    const names = await fetchAptNames(apiKey, d.lawdCd, yyyymm);
    const uniq = [...new Set(names)];
    totalRaw += uniq.length;

    const changed: Array<[string, string]> = [];
    const groups = new Map<string, Set<string>>();

    for (const raw of uniq) {
      const norm = normalizeMLTMName(raw);
      if (norm !== raw) changed.push([raw, norm]);
      if (!groups.has(norm)) groups.set(norm, new Set());
      groups.get(norm)!.add(raw);
      if (matchMaster(raw)) matchBefore += 1;
      if (matchMaster(norm)) matchAfter += 1;
    }
    totalChanged += changed.length;

    console.log(`===== ${d.name} — 고유 단지명 ${uniq.length} · 정제 변경 ${changed.length}`);
    for (const [raw, norm] of changed.slice(0, 15)) {
      console.log(`  '${raw}' → '${norm}'`);
    }
    if (changed.length > 15) console.log(`  ... 외 ${changed.length - 15}건`);

    const merged = [...groups.entries()].filter(([, set]) => set.size > 1);
    if (merged.length > 0) {
      console.log(`  ── 병합 그룹 ${merged.length}건 (동 표기로 쪼개졌던 단지):`);
      for (const [norm, set] of merged.slice(0, 10)) {
        console.log(`  [${norm}] ← ${[...set].join(' | ')}`);
      }
    }
    console.log();
  }

  console.log('====== 종합 ======');
  console.log(`고유 단지명 ${totalRaw}건 중 정제 변경 ${totalChanged}건`);
  console.log(`apartments 마스터 매칭: 정제 전 ${matchBefore} → 정제 후 ${matchAfter} (+${matchAfter - matchBefore})`);
  console.log('\nPhase 2(마스터 보강) 진행 여부는 이 리포트 검토 후 결정.');
}

main().catch((e) => {
  console.error('[report] 실패:', e);
  process.exit(1);
});
