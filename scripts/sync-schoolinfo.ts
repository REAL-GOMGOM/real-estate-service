/**
 * 학교알리미 통합 수집 — 전국 초·중·고 위치 + 현황 + 졸업자 + 전출입
 *
 * 공식 스펙 (OpenAPI_Developer_Guide.pdf, 2026):
 *   GET https://www.schoolinfo.go.kr/openApi.do
 *     ?apiKey=&apiType=&sidoCode=&sggCode=&schulKndCode=   (5개 전부 필수)
 *   응답: { resultCode: 'success', resultMsg, list: [...] }
 *
 * 수집 항목 (apiType):
 *   0  학교기본정보 — SCHUL_CODE·학교명·위경도(LTTUD/LGTUD)·주소·설립·학교특성·폐교여부
 *   62 학교 현황   — 학급수계·학생수계·학급당학생수
 *   51 입학생 현황 — 당해연도 졸업자 수·비율 (중·고)
 *   10 전·출입     — 전입·전출·전체 학생수 (학군 수요 프록시)
 *
 * 실행:
 *   npx tsx scripts/sync-schoolinfo.ts --dry              # 서울 2개 구만 (스펙 검증)
 *   npx tsx scripts/sync-schoolinfo.ts                    # 전국 (~10분, 체크포인트 저장)
 *   npx tsx scripts/sync-schoolinfo.ts --resume           # 중단 지점부터 재개
 *
 * 출력: data/school-disclosure.json (커밋 대상 — 등급 산정·지도 API의 원본)
 * 주기: 연 1회 (공시 갱신 후)
 * 필요 env: SCHOOLINFO_API_KEY
 * 출처 고지: 학교알리미(초·중등 교육정보 공시서비스) — 화면 표기 필수
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = 'https://www.schoolinfo.go.kr/openApi.do';
const SGG_CODES_PATH = path.join('data', 'sido-sgg-codes.json');
const OUT_PATH = path.join('data', 'school-disclosure.json');
const CHECKPOINT_PATH = path.join('data', 'research', 'school-disclosure.checkpoint.json');

const API_TYPES = ['0', '62', '51', '10'] as const;
/** 학교급 코드 (가이드 명세: 02 초 / 03 중 / 04 고) */
const LEVELS: { code: string; level: 'elementary' | 'middle' | 'high' }[] = [
  { code: '02', level: 'elementary' },
  { code: '03', level: 'middle' },
  { code: '04', level: 'high' },
];

const CALL_DELAY_MS = 120;
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_RETRIES = 2;
const RETRY_DELAY_MS = 1200;
const CHECKPOINT_EVERY_SGG = 10;
/** 공시연도 — 62/51/10 필수 (기본정보 0은 불요). 5월 정시공시 기준 당해연도, --year로 변경 */
const DEFAULT_PBAN_YR = '2026';

interface SggEntry { sido: string; sidoCode: string; sgg: string; sggCode: string }

interface SchoolRecord {
  code: string;
  name: string;
  level: 'elementary' | 'middle' | 'high';
  sido: string;
  sgg: string;
  sggCode: string;
  lat: number | null;
  lng: number | null;
  address: string | null;
  /** 설립구분 (공립/사립 등) */
  establishType: string | null;
  /** 학교특성 (고교 유형 — 특목·자사 배지용) */
  hsType: string | null;
  coedu: string | null;
  /** 폐교·휴교·공시제외 플래그 — 필터는 빌드 단계에서 */
  closed: boolean;
  excluded: boolean;
  /** 학생수계 — "109(4)" 형태(괄호=특수학급 병기)라 숫자부만 파싱 */
  students: number | null;
  classes: number | null;
  perClass: number | null;
  /** 입학생 총계 (51: 입학생 현황 — 졸업생이 아니라 신입생 규모·선호 지표) */
  intake: number | null;
  moveIn: number | null;
  moveOut: number | null;
  moveBase: number | null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

async function callApi(
  apiKey: string, apiType: string, sidoCode: string, sggCode: string, kndCode: string, pbanYr: string,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({
    apiKey, apiType, sidoCode, sggCode, schulKndCode: kndCode,
  });
  // 공시항목(62/51/10 등)은 pbanYr 필수 — 기본정보(0)는 최신 상태 반환이라 불요
  if (apiType !== '0') params.set('pbanYr', pbanYr);
  const url = `${BASE_URL}?${params}`;

  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 150)}`);
      const json = JSON.parse(text) as { resultCode?: string; resultMsg?: string; list?: Record<string, unknown>[] };
      if (json.resultCode !== 'success') {
        // 데이터 없음(학교 0개 시군구)과 인증 실패를 구분해 인증 오류는 즉시 중단
        const msg = String(json.resultMsg ?? '');
        if (/인증|key|권한/i.test(msg)) throw new Error(`인증 실패: ${msg}`);
        return []; // 해당 조합 데이터 없음 — 정상 케이스
      }
      return json.list ?? [];
    } catch (err) {
      if (attempt === FETCH_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return [];
}

/** apiType별 응답을 학교 레코드에 병합 */
function mergeRow(
  map: Map<string, SchoolRecord>,
  apiType: string,
  row: Record<string, unknown>,
  sggEntry: SggEntry,
  level: 'elementary' | 'middle' | 'high',
) {
  const code = str(row.SCHUL_CODE);
  if (!code) return;

  let rec = map.get(code);
  if (!rec) {
    rec = {
      code, name: str(row.SCHUL_NM) ?? '', level,
      sido: sggEntry.sido, sgg: sggEntry.sgg, sggCode: sggEntry.sggCode,
      lat: null, lng: null, address: null,
      establishType: null, hsType: null, coedu: null,
      closed: false, excluded: false,
      students: null, classes: null, perClass: null,
      intake: null,
      moveIn: null, moveOut: null, moveBase: null,
    };
    map.set(code, rec);
  }
  if (!rec.name && str(row.SCHUL_NM)) rec.name = str(row.SCHUL_NM)!;

  if (apiType === '0') {
    rec.lat = num(row.LTTUD);
    rec.lng = num(row.LGTUD);
    const road = [str(row.SCHUL_RDNMA), str(row.SCHUL_RDNDA)].filter(Boolean).join(' ');
    rec.address = road || str(row.ADRES_BRKDN);
    rec.establishType = str(row.FOND_SC_CODE);
    rec.hsType = str(row.HS_KND_SC_NM);
    rec.coedu = str(row.COEDU_SC_CODE);
    rec.closed = str(row.ABSCH_YN) === 'Y' || str(row.CLOSE_YN) === 'Y';
  } else if (apiType === '62') {
    rec.excluded = rec.excluded || str(row.PBAN_EXCP_YN) === 'Y';
    rec.students = num(row.COL_FGR_SUM);
    rec.classes = num(row.COL_SUM);
    rec.perClass = num(row.AVG_FGR_SUM);
  } else if (apiType === '51') {
    // ALL_SUM = 입학생 총계 (SUPRTI_...는 그중 당해연도 졸업 출신 — 총계 우선)
    rec.intake = num(row.ALL_SUM) ?? num(row.SUPRTI_GRDTN_BOYST_FGR);
  } else if (apiType === '10') {
    rec.moveIn = num(row.MVIN_SUM);
    rec.moveOut = num(row.MVT_SUM);
    rec.moveBase = num(row.STDNT_SUM);
  }
}

interface Checkpoint { doneSgg: string[]; schools: SchoolRecord[] }

function loadCheckpoint(): { done: Set<string>; map: Map<string, SchoolRecord> } {
  if (!existsSync(CHECKPOINT_PATH)) return { done: new Set(), map: new Map() };
  const cp = JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8')) as Checkpoint;
  return {
    done: new Set(cp.doneSgg),
    map: new Map(cp.schools.map((s) => [s.code, s])),
  };
}

function saveCheckpoint(done: Set<string>, map: Map<string, SchoolRecord>) {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify({
    doneSgg: [...done], schools: [...map.values()],
  } satisfies Checkpoint));
}

/** 특정 apiType의 원시 응답 확인 — 필드명·구조 디버깅용 (서울 중구 고정, 2026→2025 연도별) */
async function inspect(apiKey: string, apiTypes: string[], kndCode: string) {
  for (const apiType of apiTypes) {
    for (const year of ['2026', '2025']) {
      const params = new URLSearchParams({
        apiKey, apiType, sidoCode: '11', sggCode: '11140', schulKndCode: kndCode, pbanYr: year,
      });
      const res = await fetch(`${BASE_URL}?${params}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      const text = await res.text();
      console.log(`\n===== apiType=${apiType} pbanYr=${year} (중구·학교급 ${kndCode}) HTTP ${res.status} =====`);
      console.log(text.slice(0, 900));
      await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const resume = argv.includes('--resume');
  const yearIdx = argv.indexOf('--year');
  const pbanYr = yearIdx >= 0 && argv[yearIdx + 1] ? argv[yearIdx + 1] : DEFAULT_PBAN_YR;

  if (argv.includes('--inspect')) {
    const key = process.env.SCHOOLINFO_API_KEY;
    if (!key) throw new Error('SCHOOLINFO_API_KEY 환경변수 미설정');
    await inspect(key, ['62', '51', '10'], '03');
    return;
  }

  const apiKey = process.env.SCHOOLINFO_API_KEY;
  if (!apiKey) throw new Error('SCHOOLINFO_API_KEY 환경변수 미설정 (.env.local 확인)');

  const allSgg = JSON.parse(readFileSync(SGG_CODES_PATH, 'utf8')) as SggEntry[];
  const targets = dry ? allSgg.slice(0, 2) : allSgg;

  const { done, map } = resume ? loadCheckpoint() : { done: new Set<string>(), map: new Map<string, SchoolRecord>() };
  if (resume) console.log(`[schoolinfo] 재개 — 완료 시군구 ${done.size}, 누적 학교 ${map.size}`);

  const startedAt = Date.now();
  let sggProcessed = 0;

  for (const sgg of targets) {
    if (done.has(sgg.sggCode)) continue;

    for (const { code: kndCode, level } of LEVELS) {
      for (const apiType of API_TYPES) {
        // 51(졸업자)은 중·고만 공시 — 초등 호출 생략으로 콜 수 절약
        if (apiType === '51' && level === 'elementary') continue;
        await new Promise((r) => setTimeout(r, CALL_DELAY_MS));
        const rows = await callApi(apiKey, apiType, sgg.sidoCode, sgg.sggCode, kndCode, pbanYr);
        for (const row of rows) mergeRow(map, apiType, row, sgg, level);
      }
    }

    done.add(sgg.sggCode);
    sggProcessed++;
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`[schoolinfo] ${sgg.sido} ${sgg.sgg} 완료 (${done.size}/${targets.length}, 누적 ${map.size}개교, ${elapsed}s)`);
    if (sggProcessed % CHECKPOINT_EVERY_SGG === 0) saveCheckpoint(done, map);
  }

  const schools = [...map.values()];
  const byLevel = schools.reduce<Record<string, number>>((a, s) => { a[s.level] = (a[s.level] ?? 0) + 1; return a; }, {});
  const noCoord = schools.filter((s) => s.lat === null || s.lng === null).length;
  console.log(`[schoolinfo] 수집 완료: ${schools.length}개교 (초 ${byLevel.elementary ?? 0} / 중 ${byLevel.middle ?? 0} / 고 ${byLevel.high ?? 0})`);
  console.log(`[schoolinfo] 좌표 없음 ${noCoord}개 · 폐교/휴교 ${schools.filter((s) => s.closed).length}개`);

  if (dry) {
    console.log('[schoolinfo] --dry: 샘플 3건 출력, 저장 생략');
    console.log(JSON.stringify(schools.slice(0, 3), null, 2));
    return;
  }

  saveCheckpoint(done, map);
  writeFileSync(OUT_PATH, JSON.stringify({
    source: '학교알리미(초·중등 교육정보 공시서비스) OpenAPI',
    generatedAt: new Date().toISOString(),
    count: schools.length,
    schools,
  }));
  console.log(`[schoolinfo] 저장 완료 → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[schoolinfo] 실패:', err);
  process.exit(1);
});
