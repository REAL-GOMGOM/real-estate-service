/**
 * 법정동코드 검증 스크립트 — 2026.7 행정구역 개편 대응 (사이클 Z3)
 *
 * MOLIT 실거래 API 에 신·구 코드 후보를 직접 조회해 유효성을 판정한다.
 * 실행: npx tsx scripts/verify-district-codes.ts
 *
 * 판정 기준:
 * - totalCount > 0            → 코드 유효 + 거래 존재
 * - totalCount = 0 + 정상응답 → 코드 형식상 유효 (거래 없음 or 폐지 후 잔존)
 * - 에러 응답                 → 코드 무효
 * 6월(개편 전 신고분)과 7월(개편 후)을 나눠 신·구 코드 전환 여부를 본다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// .env.local → ~/.openclaw/.env 순 폴백 로드
for (const envPath of [
  path.join(process.cwd(), '.env.local'),
  path.join(os.homedir(), '.openclaw', '.env'),
]) {
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    // 값 앞뒤 따옴표 제거 (.env 에 KEY="..." 형태로 저장된 경우)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const BASE_URL = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

interface Candidate { label: string; code: string; note: string }

const CANDIDATES: Candidate[] = [
  // 대조군 (정상 확인용)
  { label: '강남구',            code: '11680', note: '대조군' },

  // 인천 — 계양 오타 수정 확인 + 개편 대상 구·신구 코드
  { label: '인천 계양구(신)',   code: '28245', note: '오타 수정 후보 (기존 28247)' },
  { label: '인천 계양구(구)',   code: '28247', note: '기존 등록값 — 무효 예상' },
  { label: '인천 중구(구)',     code: '28110', note: '7.1 폐지 — 과거분 조회용' },
  { label: '인천 동구(구)',     code: '28140', note: '7.1 폐지 — 과거분 조회용' },
  { label: '인천 서구(구)',     code: '28260', note: '7.1 폐지 — 과거분 조회용' },

  // 부천 — 2024 구 부활 (silgga 확인)
  { label: '부천시(구 통합)',   code: '41190', note: '폐지 — 과거분 조회 여부 확인' },
  { label: '부천시 원미구',     code: '41192', note: 'silgga 확인' },
  { label: '부천시 소사구',     code: '41194', note: 'silgga 확인' },
  { label: '부천시 오정구',     code: '41196', note: 'silgga 확인' },

  // 화성 — 2026.2 일반구 4개 (동탄만 silgga 확인, 나머지 후보)
  { label: '화성시(구 통합)',   code: '41590', note: '폐지 — 과거분 조회 여부 확인' },
  { label: '화성시 만세구?',    code: '41591', note: '후보 (관례 추정 — 검증 필요)' },
  { label: '화성시 효행구?',    code: '41593', note: '후보 (관례 추정 — 검증 필요)' },
  { label: '화성시 병점구?',    code: '41595', note: '후보 (관례 추정 — 검증 필요)' },
  { label: '화성시 동탄구',     code: '41597', note: 'silgga 확인' },

  // 광주·전남 — 2026.7 통합특별시 (silgga 확인 12xxx)
  { label: '광주 동구(구)',     code: '29110', note: '폐지 — 과거분 조회 여부 확인' },
  { label: '광주 동구(신)',     code: '12210', note: 'silgga 확인' },
  { label: '광주 서구(신)',     code: '12240', note: 'silgga 확인' },
  { label: '광주 남구(신)',     code: '12270', note: 'silgga 확인' },
  { label: '광주 북구(신)',     code: '12300', note: 'silgga 확인' },
  { label: '광주 광산구(신)',   code: '12330', note: 'silgga 확인' },
  { label: '목포시(신)',        code: '12110', note: 'silgga 확인' },
  { label: '여수시(신)',        code: '12130', note: 'silgga 확인' },
  { label: '순천시(신)',        code: '12150', note: 'silgga 확인' },
  { label: '나주시(신)',        code: '12170', note: 'silgga 확인' },
  { label: '광양시(신)',        code: '12190', note: 'silgga 확인' },
];

const MONTHS = ['202606', '202607'];

async function probe(code: string, yyyymm: string, apiKey: string): Promise<string> {
  const params = new URLSearchParams({
    LAWD_CD: code, DEAL_YMD: yyyymm, numOfRows: '1', pageNo: '1',
  });
  try {
    const xml = await fetch(BASE_URL + '?serviceKey=' + apiKey + '&' + params.toString())
      .then((r) => r.text());
    const total = xml.match(/<totalCount>(\d+)<\/totalCount>/)?.[1];
    if (total !== undefined) return `${total}건`;
    const msg = xml.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1];
    if (msg) return `ERR(${msg.slice(0, 30)})`;
    // 원인 진단용 — 응답 본문 앞부분 출력 (키 미포함)
    return `RAW[${xml.replace(/\s+/g, ' ').slice(0, 90)}]`;
  } catch (e) {
    return `FETCH_FAIL(${(e as Error).message.slice(0, 20)})`;
  }
}

async function main() {
  const rawKey = process.env.PUBLIC_DATA_API_KEY ?? process.env.MOLIT_API_KEY;
  if (!rawKey) {
    console.error('PUBLIC_DATA_API_KEY 미설정 (.env.local 또는 ~/.openclaw/.env)');
    process.exit(1);
  }
  const apiKey = decodeURIComponent(rawKey);

  console.log('법정동코드 검증 — MOLIT 실거래 API');
  console.log('코드      | 2026-06      | 2026-07      | 지역 (비고)');
  console.log('-'.repeat(72));

  for (const c of CANDIDATES) {
    const [jun, jul] = [
      await probe(c.code, MONTHS[0], apiKey),
      await probe(c.code, MONTHS[1], apiKey),
    ];
    console.log(
      `${c.code.padEnd(9)} | ${jun.padEnd(12)} | ${jul.padEnd(12)} | ${c.label} (${c.note})`
    );
    await new Promise((r) => setTimeout(r, 150)); // rate limit 여유
  }

  console.log('\n판정 가이드:');
  console.log('- N건(>0)     : 코드 유효, 데이터 존재');
  console.log('- 0건         : 형식 유효하나 해당 월 데이터 없음');
  console.log('- ERR(...)    : 코드 무효 또는 API 거절');
}

main();
