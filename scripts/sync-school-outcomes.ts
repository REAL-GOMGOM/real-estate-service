/**
 * 학교알리미 「졸업생의 진로 현황」 수집 — apiType 프로브 + 본수집
 *
 * 학교알리미 OpenAPI는 공시 항목별 apiType 코드가 공식 zip 문서에만 있어,
 * 프로브 모드로 코드 범위를 스캔해 항목을 식별한 뒤 본수집한다.
 *
 * 실행:
 *   npx tsx scripts/sync-school-outcomes.ts --probe                    # 중학교 기준 apiType 1~130 스캔
 *   npx tsx scripts/sync-school-outcomes.ts --probe --level high      # 고교 기준 스캔
 *   npx tsx scripts/sync-school-outcomes.ts --fetch --api-type 62 --level middle --year 2026
 *
 * 출력(본수집): data/research/school-outcomes/{level}-{year}-apiType{N}.json (원시 덤프)
 *   → 등급 산정·병합은 build-school-grades.ts(후속)가 담당
 *
 * 필요 env: SCHOOLINFO_API_KEY (학교알리미 SNS 로그인 → 인증키 발급)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://www.schoolinfo.go.kr/openApi.do';
const RAW_DIR = path.join('data', 'research', 'school-outcomes');
const PROBE_DELAY_MS = 300;
const PROBE_DEFAULT_FROM = 1;
const PROBE_DEFAULT_TO = 130;
/** 공시연도 기본값 — 5월 정시공시 기준 당해연도, 데이터 없으면 전년도로 재시도 안내 */
const DEFAULT_YEAR = '2026';

/** 학교급 코드 (학교알리미 공시 관례: 02 초 / 03 중 / 04 고) */
const SCHUL_KND: Record<string, string> = { elementary: '02', middle: '03', high: '04' };

/** 진로·진학 항목 후보 탐지 패턴 (프로브 출력 ★ 마킹) — 성취도(내신 분포)는 참고용으로만 수집, 등급 산정엔 미사용 */
const CAREER_KEY_PATTERN = /진학|진로|졸업|성취|GRDT|GRDAT|ENTRC|EMPLYM|HGSCH|UNIV|SHS|FRHS|ACHV/i;

interface Args {
  probe: boolean;
  fetch: boolean;
  apiType: number | null;
  level: string;
  year: string;
  from: number;
  to: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(`--${name}`);
  const value = (name: string): string | null => {
    const idx = argv.indexOf(`--${name}`);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : null;
  };
  return {
    probe: flag('probe'),
    fetch: flag('fetch'),
    apiType: value('api-type') ? parseInt(value('api-type')!, 10) : null,
    level: value('level') ?? 'middle',
    year: value('year') ?? DEFAULT_YEAR,
    from: value('from') ? parseInt(value('from')!, 10) : PROBE_DEFAULT_FROM,
    to: value('to') ? parseInt(value('to')!, 10) : PROBE_DEFAULT_TO,
  };
}

function buildUrl(apiKey: string, apiType: number, year: string, kndCode: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({
    apiKey,
    apiType: String(apiType),
    pbanYr: year,
    schulKndCode: kndCode,
    ...extra,
  });
  return `${BASE_URL}?${params}`;
}

function safeJsonParse(text: string): unknown | null {
  try { return JSON.parse(text); } catch { return null; }
}

/** 응답 객체에서 첫 번째 배열(레코드 리스트)을 깊이 2까지 탐색 */
function findList(json: unknown): { listKey: string; list: Record<string, unknown>[] } | null {
  if (typeof json !== 'object' || json === null) return null;
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
      return { listKey: k, list: v as Record<string, unknown>[] };
    }
    if (typeof v === 'object' && v !== null) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(v2) && v2.length > 0 && typeof v2[0] === 'object') {
          return { listKey: `${k}.${k2}`, list: v2 as Record<string, unknown>[] };
        }
      }
    }
  }
  return null;
}

async function callApi(url: string): Promise<{ json: unknown | null; rawHead: string }> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  return { json: safeJsonParse(text), rawHead: text.slice(0, 200).replace(/\s+/g, ' ') };
}

// ── 프로브: apiType 스캔 → 항목 후보 리포트 ─────────────────────
async function probe(apiKey: string, args: Args) {
  const kndCode = SCHUL_KND[args.level];
  console.log(`[probe] level=${args.level}(${kndCode}) year=${args.year} apiType ${args.from}~${args.to} 스캔`);
  const hits: { apiType: number; keys: string[]; count: number }[] = [];

  for (let t = args.from; t <= args.to; t++) {
    await new Promise((r) => setTimeout(r, PROBE_DELAY_MS));
    try {
      const { json, rawHead } = await callApi(buildUrl(apiKey, t, args.year, kndCode));
      if (!json) {
        console.log(`  apiType=${t}: JSON 아님 — ${rawHead.slice(0, 80)}`);
        continue;
      }
      const found = findList(json);
      if (!found) {
        // resultMsg 등 메타만 있는 응답 — 짧게 로그
        console.log(`  apiType=${t}: 리스트 없음 — ${JSON.stringify(json).slice(0, 100)}`);
        continue;
      }
      const keys = Object.keys(found.list[0]);
      const isCareer = keys.some((k) => CAREER_KEY_PATTERN.test(k));
      console.log(`  apiType=${t}: ${found.list.length}행 [${found.listKey}] ${isCareer ? '★진로후보' : ''} 키=${keys.slice(0, 12).join(',')}`);
      if (isCareer) hits.push({ apiType: t, keys, count: found.list.length });
    } catch (err) {
      console.log(`  apiType=${t}: 요청 실패 — ${err}`);
    }
  }

  console.log('\n[probe] ★ 진로 후보 요약:');
  if (hits.length === 0) {
    console.log('  없음 — --year를 전년도로 바꾸거나 --to 범위를 늘려 재스캔하세요.');
  }
  for (const h of hits) {
    console.log(`  apiType=${h.apiType} (${h.count}행)\n    전체 키: ${h.keys.join(', ')}`);
  }
}

// ── 본수집: 확정된 apiType 전체 수집 (페이징 자동 탐지) ─────────
async function fetchAll(apiKey: string, args: Args) {
  if (args.apiType === null) throw new Error('--fetch에는 --api-type N이 필요합니다 (프로브로 확정)');
  const kndCode = SCHUL_KND[args.level];
  console.log(`[fetch] apiType=${args.apiType} level=${args.level} year=${args.year}`);

  const firstUrl = buildUrl(apiKey, args.apiType, args.year, kndCode);
  const { json, rawHead } = await callApi(firstUrl);
  if (!json) throw new Error(`JSON 응답 아님: ${rawHead}`);
  const found = findList(json);
  if (!found) throw new Error(`레코드 리스트를 찾지 못함: ${JSON.stringify(json).slice(0, 200)}`);

  const rows = [...found.list];
  console.log(`[fetch] 1차 응답 ${rows.length}행 (listKey=${found.listKey})`);

  // 페이징 지원 여부 자동 탐지 — 응답이 정확히 라운드 숫자면 절단 의심
  const suspicious = [100, 300, 500, 1000].includes(rows.length);
  if (suspicious) {
    const schemes: Record<string, string>[] = [
      { pIndex: '2', pSize: String(rows.length) },
      { pageNo: '2', numOfRows: String(rows.length) },
      { currentPage: '2', pageSize: String(rows.length) },
    ];
    for (const scheme of schemes) {
      const { json: j2 } = await callApi(buildUrl(apiKey, args.apiType, args.year, kndCode, scheme));
      const f2 = j2 ? findList(j2) : null;
      const differs = f2 && f2.list.length > 0 &&
        JSON.stringify(f2.list[0]) !== JSON.stringify(rows[0]);
      if (differs) {
        console.log(`[fetch] 페이징 스킴 감지: ${JSON.stringify(scheme)} — 전체 페이지 수집`);
        rows.push(...f2!.list);
        for (let p = 3; ; p++) {
          await new Promise((r) => setTimeout(r, PROBE_DELAY_MS));
          const pageParams = Object.fromEntries(
            Object.entries(scheme).map(([k, v]) => [k, k.toLowerCase().includes('page') || k === 'pIndex' ? String(p) : v]),
          );
          const { json: jp } = await callApi(buildUrl(apiKey, args.apiType, args.year, kndCode, pageParams));
          const fp = jp ? findList(jp) : null;
          if (!fp || fp.list.length === 0) break;
          rows.push(...fp.list);
          if (fp.list.length < found.list.length) break; // 마지막 짧은 페이지
        }
        break;
      }
    }
    if (rows.length === found.list.length) {
      console.warn('[fetch] ⚠ 라운드 숫자 응답이지만 페이징 스킴 미감지 — 단일 응답으로 저장 (절단 여부 검토 필요)');
    }
  }

  mkdirSync(RAW_DIR, { recursive: true });
  const outPath = path.join(RAW_DIR, `${args.level}-${args.year}-apiType${args.apiType}.json`);
  writeFileSync(outPath, JSON.stringify({
    source: `학교알리미 OpenAPI apiType=${args.apiType} pbanYr=${args.year} schulKndCode=${kndCode}`,
    fetchedAt: new Date().toISOString(),
    count: rows.length,
    sampleKeys: Object.keys(rows[0]),
    rows,
  }));
  console.log(`[fetch] 저장 완료 → ${outPath} (${rows.length}행)`);
}

async function main() {
  const args = parseArgs();
  const apiKey = process.env.SCHOOLINFO_API_KEY;
  if (!apiKey) throw new Error('SCHOOLINFO_API_KEY 환경변수 미설정 — 학교알리미에서 인증키 발급 후 .env.local에 추가');

  if (args.probe) return probe(apiKey, args);
  if (args.fetch) return fetchAll(apiKey, args);
  console.log('사용법: --probe [--level middle|high] [--year 2026] [--from 1 --to 130]');
  console.log('        --fetch --api-type N --level middle|high [--year 2026]');
}

main().catch((err) => {
  console.error('[outcomes] 실패:', err);
  process.exit(1);
});
