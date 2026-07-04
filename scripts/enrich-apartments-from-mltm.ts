import { config } from 'dotenv';
import { homedir } from 'node:os';
import path from 'node:path';
config({ path: '.env.local' });
config({ path: path.join(homedir(), '.openclaw', '.env') });

import { neon } from '@neondatabase/serverless';
import { normalizeMLTMName } from '../lib/normalize-mltm-name';
import { getSudogwonDistricts } from '../lib/report/districts';

/**
 * "실거래 데이터 품질" Phase 2 — MLTM 실거래 기반 apartments 마스터 보강.
 *
 * 결정(인계 문서 Q1=A): 추가 API 없이 MLTM 거래의 aptNm(정제본)으로
 * 마스터에 없는 단지를 추가한다. 재건축·신축 누락(~50%) 해소 목적.
 *
 * 안전장치:
 * - dry-run 기본, --execute에서만 INSERT
 * - idempotent: id = `mltm-{lawdCd}-{정제명}` + ON CONFLICT DO NOTHING
 * - 기존 마스터 name·aliases와 공백무시 비교로 중복 방지
 * - source='mltm'으로 표시 — 추후 좌표·세대수 보강(백로그) 대상 식별
 *
 * 실행:
 *   npx tsx scripts/enrich-apartments-from-mltm.ts            # dry-run
 *   npx tsx scripts/enrich-apartments-from-mltm.ts --execute  # 적용
 */
const MONTHS_BACK = 3;
const SIDO_FULL: Record<string, string> = {
  서울: '서울특별시',
  경기: '경기도',
  인천: '인천광역시',
};

function recentMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const squash = (s: string) => s.replace(/\s/g, '');

interface MoLtmRow { aptNm: string; umdNm: string }

async function fetchMonth(apiKey: string, lawdCd: string, yyyymm: string): Promise<MoLtmRow[]> {
  const base =
    `https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev` +
    `?serviceKey=${apiKey}&LAWD_CD=${lawdCd}&DEAL_YMD=${yyyymm}&numOfRows=1000`;
  const rows: MoLtmRow[] = [];

  const first = await fetch(`${base}&pageNo=1`).then((r) => r.text());
  const total = parseInt(first.match(/<totalCount>(\d+)<\/totalCount>/)?.[1] ?? '0', 10);
  const pages = Math.max(1, Math.ceil(total / 1000));

  const parse = (xml: string) => {
    for (const item of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
      const aptNm = item.match(/<aptNm>([^<]*)<\/aptNm>/)?.[1]?.trim();
      const umdNm = item.match(/<umdNm>([^<]*)<\/umdNm>/)?.[1]?.trim() ?? '';
      if (aptNm) rows.push({ aptNm, umdNm });
    }
  };
  parse(first);
  for (let p = 2; p <= pages; p++) {
    parse(await fetch(`${base}&pageNo=${p}`).then((r) => r.text()));
  }
  return rows;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const apiKey = process.env.MOLIT_API_KEY ?? process.env.DATA_GO_KR_API_KEY;
  const dbUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!apiKey) { console.error('[enrich] MOLIT_API_KEY 미설정'); process.exit(1); }
  if (!dbUrl) { console.error('[enrich] DATABASE_URL_UNPOOLED 미설정'); process.exit(1); }

  const sql = neon(dbUrl);
  const master = (await sql`SELECT name, aliases, lawd_cd FROM apartments`) as Array<{
    name: string; aliases: string[] | null; lawd_cd: string;
  }>;

  // lawdCd별 공백무시 이름 셋 (name + aliases)
  const masterByLawd = new Map<string, Set<string>>();
  for (const m of master) {
    if (!masterByLawd.has(m.lawd_cd)) masterByLawd.set(m.lawd_cd, new Set());
    const set = masterByLawd.get(m.lawd_cd)!;
    set.add(squash(m.name));
    for (const a of m.aliases ?? []) set.add(squash(a));
  }

  const districts = getSudogwonDistricts();
  const months = recentMonths(MONTHS_BACK);
  console.log(`[enrich] 수도권 ${districts.length}개 지역 × ${months.join(',')} · 마스터 ${master.length}건\n`);

  type Candidate = {
    id: string; name: string; aliases: string[]; sido: string; sigungu: string;
    dong: string; lawdCd: string;
  };
  const candidates = new Map<string, Candidate>();

  for (const d of districts) {
    const known = masterByLawd.get(d.code) ?? new Set<string>();
    // 정제명 → { 원본 표기들, 동별 빈도 }
    const seen = new Map<string, { raws: Set<string>; dongs: Map<string, number> }>();

    for (const m of months) {
      let rows: MoLtmRow[] = [];
      try {
        rows = await fetchMonth(apiKey, d.code, m);
      } catch {
        console.warn(`  ⚠️ ${d.name} ${m} 수집 실패 — 건너뜀`);
        continue;
      }
      for (const row of rows) {
        const norm = normalizeMLTMName(row.aptNm);
        if (!seen.has(norm)) seen.set(norm, { raws: new Set(), dongs: new Map() });
        const e = seen.get(norm)!;
        if (row.aptNm !== norm) e.raws.add(row.aptNm);
        e.dongs.set(row.umdNm, (e.dongs.get(row.umdNm) ?? 0) + 1);
      }
      await new Promise((r) => setTimeout(r, 120)); // rate 완충
    }

    let added = 0;
    for (const [norm, e] of seen) {
      if (known.has(squash(norm))) continue;
      const dong = [...e.dongs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      const id = `mltm-${d.code}-${squash(norm)}`;
      candidates.set(id, {
        id,
        name: norm,
        aliases: [...e.raws],
        sido: SIDO_FULL[d.sido] ?? d.sido,
        sigungu: d.name,
        dong,
        lawdCd: d.code,
      });
      added += 1;
    }
    console.log(`  ${d.name}(${d.code}): 거래 단지 ${seen.size} · 마스터 부재 ${added}`);
  }

  console.log(`\n[enrich] 보강 후보 총 ${candidates.size}건`);
  const sample = [...candidates.values()].slice(0, 20);
  for (const c of sample) {
    console.log(`  + [${c.sigungu}] ${c.name}${c.aliases.length ? ` (표기: ${c.aliases.join(' | ')})` : ''}`);
  }
  if (candidates.size > 20) console.log(`  ... 외 ${candidates.size - 20}건`);

  if (!execute) {
    console.log('\n[enrich] dry-run 종료 — 적용은 --execute');
    return;
  }

  let inserted = 0;
  for (const c of candidates.values()) {
    const result = await sql`
      INSERT INTO apartments (id, name, aliases, sido, sigungu, dong, lawd_cd, source)
      VALUES (${c.id}, ${c.name}, ${JSON.stringify(c.aliases)}::jsonb, ${c.sido}, ${c.sigungu}, ${c.dong}, ${c.lawdCd}, 'mltm')
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    if ((result as unknown[]).length > 0) inserted += 1;
  }
  console.log(`\n[enrich] 적용 완료: ${inserted}건 삽입 (중복 skip ${candidates.size - inserted})`);
  const count = (await sql`SELECT count(*)::int AS c FROM apartments`) as Array<{ c: number }>;
  console.log(`[enrich] apartments 총 ${count[0]?.c}건`);
}

main().catch((e) => {
  console.error('[enrich] 실패:', e);
  process.exit(1);
});
