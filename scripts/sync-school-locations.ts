/**
 * 전국 초·중·고 위치 수집 — 행안부 「전국초중등학교위치표준데이터」
 *
 * 실행: npx tsx scripts/sync-school-locations.ts
 * 출력: data/school-locations.json (커밋 대상 — 지도·학군 파이프라인의 위치 원본)
 * 주기: 연 1회 (신설·폐교 반영)
 *
 * 설계 노트:
 * - 응답 필드명은 기관 스펙 변경 가능성이 있어 후보군 매핑으로 해석하고,
 *   매핑 실패 시 실제 키 목록을 출력하고 즉시 종료한다 (조용한 데이터 오염 방지).
 * - 위경도가 표준데이터에 포함되어 있어 별도 지오코딩이 필요 없다.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { writeFileSync } from 'node:fs';
import path from 'node:path';

const API_URL = 'https://api.data.go.kr/openapi/tn_pubr_public_elesch_mskul_lc_api';
const OUT_PATH = path.join('data', 'school-locations.json');
const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 200;
const FETCH_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const FETCH_TIMEOUT_MS = 30_000;

type SchoolLevel = 'elementary' | 'middle' | 'high';

interface SchoolLocation {
  /** 표준데이터 학교ID — 학교알리미 학교코드와의 조인 후보 키 */
  id: string;
  name: string;
  level: SchoolLevel;
  lat: number;
  lng: number;
  address: string;
  /** 시도 (정규화: 서울특별시 → 서울) */
  region: string;
  /** 시군구 (예: 강동구, 성남시분당구) */
  district: string;
  /** 설립 형태 (공립/사립 등) — 없으면 null */
  establishType: string | null;
}

/** 논리 필드 → 실제 응답 키 후보 (표준데이터 명세 변형 대응) */
const KEY_CANDIDATES: Record<string, string[]> = {
  id:        ['schoolId', 'SCHOOL_ID', '학교ID'],
  name:      ['schoolNm', 'schulNm', 'SCHUL_NM', '학교명'],
  level:     ['schoolSe', 'schoolLvSe', 'schulKndScNm', '학교급구분'],
  lat:       ['latitude', 'lat', '위도'],
  lng:       ['longitude', 'lot', 'lng', '경도'],
  roadAddr:  ['rdnmadr', 'ORG_RDNMA', '소재지도로명주소'],
  lotAddr:   ['lnmadr', '소재지지번주소'],
  operState: ['operSttus', 'operState', '운영상태'],
  estType:   ['fondSe', 'estType', '설립형태'],
};

/** 첫 레코드에서 실제 키를 확정 — 실패한 필수 필드가 있으면 키 목록과 함께 종료 */
function resolveKeys(sample: Record<string, unknown>): Record<string, string | null> {
  const resolved: Record<string, string | null> = {};
  for (const [logical, candidates] of Object.entries(KEY_CANDIDATES)) {
    resolved[logical] = candidates.find((c) => c in sample) ?? null;
  }
  const required = ['name', 'level', 'lat', 'lng'];
  const missing = required.filter((k) => !resolved[k]);
  if (missing.length > 0) {
    console.error(`[locations] 필수 필드 매핑 실패: ${missing.join(', ')}`);
    console.error(`[locations] 실제 응답 키 목록: ${Object.keys(sample).join(', ')}`);
    console.error('[locations] KEY_CANDIDATES에 해당 키를 추가한 뒤 재실행하세요.');
    process.exit(1);
  }
  return resolved;
}

function toLevel(raw: string): SchoolLevel | null {
  if (raw.includes('초등')) return 'elementary';
  if (raw.includes('고등')) return 'high';
  if (raw.includes('중')) return 'middle';
  return null; // 특수·각종학교 등은 제외
}

/** "서울특별시 강동구 ..." → { region: '서울', district: '강동구' } */
function parseRegion(address: string): { region: string; district: string } {
  const parts = address.split(/\s+/);
  const sido = (parts[0] ?? '')
    .replace(/특별자치시$|특별자치도$|특별시$|광역시$|도$/, '')
    .trim();
  // 세종처럼 구가 없는 시도는 시도명을 그대로 시군구로 사용
  let district = parts[1] ?? '';
  // "성남시 분당구" 형태는 시+구를 합쳐 기존 컨벤션(분당구 등)과 맞춘다
  if (district.endsWith('시') && (parts[2] ?? '').endsWith('구')) {
    district = `${district}${parts[2]}`;
  }
  if (!district) district = `${sido}시`;
  return { region: sido || '미상', district };
}

async function fetchPage(apiKey: string, pageNo: number): Promise<unknown> {
  const url =
    `${API_URL}?serviceKey=${encodeURIComponent(apiKey)}` +
    `&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;

  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      // 정부 게이트웨이는 UA 없는 요청을 지연·차단하는 사례가 있어 브라우저 UA 명시.
      // 무한 대기 대신 30초 컷 후 재시도.
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
      // JSON이 아닌 응답(인증 오류 XML 등)은 원문을 보여주고 실패 처리
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`JSON 아님 (인증·신청 상태 확인 필요) — ${text.slice(0, 300)}`);
      }
    } catch (err) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (attempt === FETCH_RETRIES) throw err;
      console.warn(`[locations] p${pageNo} 재시도 ${attempt + 1}/${FETCH_RETRIES} (${elapsed}s 경과): ${err}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  throw new Error('unreachable');
}

/** 표준데이터 응답에서 items 배열과 totalCount 추출 (형태 변형 방어) */
function extractBody(json: unknown): { items: Record<string, unknown>[]; totalCount: number } {
  const body = (json as { response?: { header?: { resultCode?: string; resultMsg?: string }; body?: { items?: unknown; totalCount?: number | string } } })?.response;
  const code = body?.header?.resultCode;
  if (code && code !== '00') {
    throw new Error(`API 오류 resultCode=${code} msg=${body?.header?.resultMsg ?? '?'}`);
  }
  const rawItems = body?.body?.items;
  const items = Array.isArray(rawItems)
    ? rawItems
    : ((rawItems as { item?: unknown[] })?.item ?? []);
  const totalCount = Number(body?.body?.totalCount ?? 0);
  return { items: items as Record<string, unknown>[], totalCount };
}

async function main() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY;
  if (!rawKey) throw new Error('PUBLIC_DATA_API_KEY 환경변수 미설정 (.env.local 확인)');
  const apiKey = decodeURIComponent(rawKey);

  console.log('[locations] 전국초중등학교위치표준데이터 수집 시작');

  const first = await fetchPage(apiKey, 1);
  const { items: firstItems, totalCount } = extractBody(first);
  if (firstItems.length === 0) {
    console.error('[locations] 첫 페이지가 비어 있습니다 — 활용신청 승인 여부를 확인하세요.');
    console.error(`[locations] 원시 응답 앞부분: ${JSON.stringify(first).slice(0, 300)}`);
    process.exit(1);
  }
  const keys = resolveKeys(firstItems[0]);
  console.log(`[locations] totalCount=${totalCount}, 키 매핑: ${JSON.stringify(keys)}`);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const allItems: Record<string, unknown>[] = [...firstItems];
  for (let p = 2; p <= totalPages; p++) {
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    const { items } = extractBody(await fetchPage(apiKey, p));
    allItems.push(...items);
    console.log(`[locations] p${p}/${totalPages} 누적 ${allItems.length}행`);
  }

  // 파싱 + 필터 (운영 중 + 초·중·고만 + 좌표 유효)
  const seen = new Set<string>();
  const schools: SchoolLocation[] = [];
  let skippedLevel = 0, skippedCoord = 0, skippedClosed = 0, skippedDup = 0;

  for (const row of allItems) {
    const get = (k: string) => (keys[k] ? String(row[keys[k] as string] ?? '').trim() : '');

    const operState = get('operState');
    if (operState && !operState.includes('운영')) { skippedClosed++; continue; }

    const level = toLevel(get('level'));
    if (!level) { skippedLevel++; continue; }

    const lat = parseFloat(get('lat'));
    const lng = parseFloat(get('lng'));
    // 대한민국 좌표 범위 밖이면 오염 데이터로 간주
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
      skippedCoord++; continue;
    }

    const name = get('name');
    const address = get('roadAddr') || get('lotAddr');
    const id = get('id') || `${name}-${address}`;
    if (seen.has(id)) { skippedDup++; continue; }
    seen.add(id);

    const { region, district } = parseRegion(address);
    schools.push({
      id, name, level, lat, lng, address, region, district,
      establishType: get('estType') || null,
    });
  }

  // 새너티 체크 — 전국 수집인데 특정 급이 비면 스펙 변경 의심
  const byLevel = schools.reduce<Record<string, number>>((acc, s) => {
    acc[s.level] = (acc[s.level] ?? 0) + 1; return acc;
  }, {});
  console.log(`[locations] 파싱 완료: ${schools.length}개 (초 ${byLevel.elementary ?? 0} / 중 ${byLevel.middle ?? 0} / 고 ${byLevel.high ?? 0})`);
  console.log(`[locations] 제외: 폐교·휴교 ${skippedClosed}, 급 외 ${skippedLevel}, 좌표 불량 ${skippedCoord}, 중복 ${skippedDup}`);
  if ((byLevel.elementary ?? 0) < 1000 || (byLevel.middle ?? 0) < 500 || (byLevel.high ?? 0) < 300) {
    console.warn('[locations] ⚠ 학교 수가 전국 규모 대비 비정상적으로 적습니다 — 저장은 하되 검토 필요.');
  }

  writeFileSync(OUT_PATH, JSON.stringify({
    source: '행정안전부 전국초중등학교위치표준데이터 (data.go.kr 15021148)',
    generatedAt: new Date().toISOString(),
    count: schools.length,
    schools,
  }));
  console.log(`[locations] 저장 완료 → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[locations] 실패:', err);
  process.exit(1);
});
