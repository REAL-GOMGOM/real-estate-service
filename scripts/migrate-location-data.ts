/**
 * 입지 점수 v1 → v2 마이그레이션 스크립트
 *
 * data/research/scored_base.csv + scored_sensitivity.csv
 *   → data/location-scores.json (v2 스키마)
 *
 * 사용법:
 *   npx tsx scripts/migrate-location-data.ts --dry-run   # 검증만
 *   npx tsx scripts/migrate-location-data.ts              # 실제 실행
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import Papa from 'papaparse';
import fs from 'fs';

// ── 타입 ──

interface OldLocationScore {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  score: number;
  trend: 'up' | 'down' | 'flat';
  prevScore: number;
  month: string;
  isToheo: boolean;
  toheoUntil?: string;
  region: string;
  level: 'city' | 'district';
  cityId?: string;
}

interface NewLocationScore {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  region: string;
  level: 'city' | 'district';
  cityId?: string;
  month: string;
  score: number;
  trend: 'up' | 'down' | 'flat';
  prevScore: number;
  metrics: {
    pricePerPyeong: number | null;
    annualChange2025: number | null;
    weeklyChange2026: number | null;
    transport: number;
    school: number;
    industry: number;
    supply: number;
    jeonseRatio: number | null;
    populationFlow: number;
    tradeVolumeChange: number;
    unsold: number;
    confidence: 'H' | 'M' | 'L';
  };
  scenarios: {
    base: number;
    price: number;
    growth: number;
    infra: number;
    sensitivity: number;
  };
  isToheo: boolean;
  toheoUntil?: string;
  specialNote?: string;
  source: 'eric_v2';
  lastUpdated: string;
}

// ── region 매핑 ──

const REGION_MAP: Record<string, string> = {
  서울: '서울',
  인천: '인천',
  부산: '부산',
  대구: '대구',
  울산: '울산',
  성남: '경기',
  수원: '경기',
  고양: '경기',
  용인: '경기',
  안양: '경기',
  안산: '경기',
  과천: '경기',
  광명: '경기',
  하남: '경기',
  의왕: '경기',
  부천: '경기',
  구리: '경기',
  남양주: '경기',
  의정부: '경기',
  시흥: '경기',
  김포: '경기',
  화성: '경기',
  평택: '경기',
  파주: '경기',
  군포: '경기',
  신도시: '1기신도시', // fallback — name 접미사로 1기/2기 구분 (resolveRegion)
  '2기': '2기신도시',
  '3기': '3기신도시',
  기타: '3기신도시',
};

/** region=신도시인 경우 name 접미사로 1기/2기 분류 */
function resolveRegion(csvRegion: string, csvName: string): string {
  const mapped = REGION_MAP[csvRegion];
  if (!mapped) return csvRegion;
  // region=신도시이지만 name에 (2기) 포함 → 2기신도시
  if (mapped === '1기신도시' && csvName.includes('(2기)')) {
    return '2기신도시';
  }
  return mapped;
}

// ── CSV name → 기존 JSON name 매핑 (형식 차이 해결) ──

const NAME_ALIAS: Record<string, string> = {
  서울전체: '서울',
  인천전체: '인천',
  성남시전체: '성남시',
  수원시전체: '수원시',
  고양시전체: '고양시',
  용인시전체: '용인시',
  안양시전체: '안양시',
  안산시전체: '안산시',
  대구전체: '대구',
  울산전체: '울산',
  '일산(1기)': '일산',
  '평촌(1기)': '평촌',
  '산본(1기)': '산본',
  '중동(1기)': '중동',
  '판교(2기)': '판교',
  '광교(2기)': '광교',
  '동탄(2기)': '동탄',
  '위례(2기)': '위례',
  '김포한강(2기)': '김포한강',
  '파주운정(2기)': '파주운정',
  '양주옥정(2기)': '양주옥정',
  '장상(공공)': '장상',
  '청계(공공)': '청계',
  고덕국제: '고덕국제',
};

// ── city-level 리스트 ──

const CITY_LEVEL_NAMES = new Set([
  '서울전체',
  '인천전체',
  '성남시전체',
  '수원시전체',
  '고양시전체',
  '용인시전체',
  '안양시전체',
  '안산시전체',
  '대구전체',
  '울산전체',
]);

// ── 중복 name 해결: region+name → 기존 id (지방 도시 동명구) ──

const DUPE_RESOLVE: Record<string, string> = {
  // 강서구
  '서울:강서구': 'gangseo-gu',
  '부산:강서구': 'busan-gangseo',
  // 중구
  '서울:중구': 'jung-gu-seoul',
  '인천:중구': 'incheon-jung',
  '부산:중구': 'busan-jung',
  '대구:중구': 'daegu-jung',
  '울산:중구': 'ulsan-jung',
  // 서구
  '인천:서구': 'incheon-seo',
  '부산:서구': 'busan-seo',
  '대구:서구': 'daegu-seo',
  // 동구
  '인천:동구': 'incheon-dong',
  '부산:동구': 'busan-dong',
  '대구:동구': 'daegu-dong',
  '울산:동구': 'ulsan-dong',
  // 남구
  '부산:남구': 'busan-nam',
  '대구:남구': 'daegu-nam',
  '울산:남구': 'ulsan-nam',
  // 북구
  '부산:북구': 'busan-buk',
  '대구:북구': 'daegu-buk',
  '울산:북구': 'ulsan-buk',
};

// ── 장상/청계 특수 메모 ──

const SPECIAL_NOTES: Record<string, string> = {
  '장상(공공)': '중소규모 공공주택지구 (약 480세대, 국토부 지정)',
  '청계(공공)': '중소규모 공공주택지구 (약 480세대, 국토부 지정)',
};

// ── 기존 JSON에 없는 신규 지역 수동 매핑 (id, lat, lng, district) ──

const NEW_LOCATIONS: Record<
  string,
  { id: string; lat: number; lng: number; district: string; cityId?: string }
> = {
  군위군: {
    id: 'daegu-gunwi',
    lat: 36.2428,
    lng: 128.5727,
    district: '대구 군위군',
    cityId: 'daegu-city',
  },
};

// ── 유틸 ──

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === '분양전' || v === '-')
    return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function computeTrend(
  weeklyChange: number | null,
): 'up' | 'down' | 'flat' {
  if (weeklyChange === null) return 'flat';
  if (weeklyChange > 0.1) return 'up';
  if (weeklyChange < -0.05) return 'down';
  return 'flat';
}

// ── 메인 ──

const DRY_RUN = process.argv.includes('--dry-run');

function main() {
  const basePath = path.join(process.cwd(), 'data/research/scored_base.csv');
  const sensPath = path.join(
    process.cwd(),
    'data/research/scored_sensitivity.csv',
  );
  const oldPath = path.join(
    process.cwd(),
    'data/location-scores.v1.backup.json',
  );
  const outPath = path.join(process.cwd(), 'data/location-scores.json');

  // 1. CSV 읽기
  const baseRaw = fs.readFileSync(basePath, 'utf-8');
  const sensRaw = fs.readFileSync(sensPath, 'utf-8');

  const baseResult = Papa.parse<Record<string, string>>(baseRaw, {
    header: true,
    dynamicTyping: false, // 수동 파싱 (NaN 방지)
    skipEmptyLines: true,
  });
  const sensResult = Papa.parse<Record<string, string>>(sensRaw, {
    header: true,
    dynamicTyping: false,
    skipEmptyLines: true,
  });

  const baseRows = baseResult.data;
  const sensRows = sensResult.data;

  console.log(`📊 scored_base.csv: ${baseRows.length}건`);
  console.log(`📊 scored_sensitivity.csv: ${sensRows.length}건`);

  // sensitivity를 no 기준으로 맵 만들기
  const sensMap = new Map<string, Record<string, string>>();
  for (const row of sensRows) {
    sensMap.set(row.no, row);
  }

  // 2. 기존 JSON 읽기 (id/lat/lng 소스)
  const oldData: OldLocationScore[] = JSON.parse(
    fs.readFileSync(oldPath, 'utf-8'),
  );
  const oldByName = new Map<string, OldLocationScore>();
  const oldById = new Map<string, OldLocationScore>();
  for (const o of oldData) {
    oldByName.set(o.name, o);
    oldById.set(o.id, o);
  }

  // 3. 변환
  const results: NewLocationScore[] = [];
  let matched = 0;
  let unmatched = 0;
  const unmatchedList: string[] = [];
  const regionCount: Record<string, number> = {};
  let cityCount = 0;
  let districtCount = 0;

  for (const row of baseRows) {
    const csvName = row.name;
    const csvRegion = row.region;

    // name 정규화 → 기존 JSON name
    const resolvedName = NAME_ALIAS[csvName] ?? csvName;

    // 중복 name 해결
    const dupeKey = `${csvRegion}:${csvName}`;
    const dupeId = DUPE_RESOLVE[dupeKey];

    // 기존 JSON에서 매칭
    let old: OldLocationScore | undefined;
    if (dupeId) {
      old = oldById.get(dupeId);
    } else {
      old = oldByName.get(resolvedName);
    }

    // 기존 JSON에 없으면 NEW_LOCATIONS fallback
    const newLoc = NEW_LOCATIONS[csvName];
    if (!old && !newLoc) {
      unmatched++;
      unmatchedList.push(`${csvName} (region=${csvRegion})`);
      continue;
    }

    const idVal = old?.id ?? newLoc!.id;
    const latVal = old?.lat ?? newLoc!.lat;
    const lngVal = old?.lng ?? newLoc!.lng;
    const districtVal = old?.district ?? newLoc!.district;
    const cityIdVal = old?.cityId ?? newLoc?.cityId;
    const isToheoVal = old?.isToheo ?? false;
    const toheoUntilVal = old?.toheoUntil;
    const oldLevel = old?.level;
    matched++;

    // region 변환
    const newRegion = resolveRegion(csvRegion, csvName);
    regionCount[newRegion] = (regionCount[newRegion] ?? 0) + 1;

    // level 판정
    const isCity = CITY_LEVEL_NAMES.has(csvName) || oldLevel === 'city';
    if (isCity) cityCount++;
    else districtCount++;

    // 시나리오 데이터
    const sens = sensMap.get(row.no);

    // 메트릭 파싱
    const weeklyChange = parseNum(row['주간지수_2026']);

    // display name: alias 되돌린 원래 이름 사용
    const displayName = old?.name ?? resolvedName;

    const record: NewLocationScore = {
      id: idVal,
      name: displayName,
      district: districtVal,
      lat: latVal,
      lng: lngVal,
      region: newRegion,
      level: isCity ? 'city' : 'district',
      ...(cityIdVal ? { cityId: cityIdVal } : {}),
      month: '2026-04',

      score: Number(row['재산정점수']),
      trend: computeTrend(weeklyChange),
      prevScore: Number(row['original_score']),

      metrics: {
        pricePerPyeong: parseNum(row['평당가']),
        annualChange2025: parseNum(row['매매누계_2025']),
        weeklyChange2026: weeklyChange,
        transport: Number(row['교통']),
        school: Number(row['학군']),
        industry: Number(row['산업']),
        supply: Number(row['공급']),
        jeonseRatio: parseNum(row['전세가율']),
        populationFlow: Number(row['인구순이동']),
        tradeVolumeChange: Number(row['거래량증감']),
        unsold: Number(row['미분양']),
        confidence: row['신뢰도'] as 'H' | 'M' | 'L',
      },

      scenarios: {
        base: Number(sens?.['점수_Base'] ?? row['재산정점수']),
        price: Number(sens?.['점수_Price'] ?? row['재산정점수']),
        growth: Number(sens?.['점수_Growth'] ?? row['재산정점수']),
        infra: Number(sens?.['점수_Infra'] ?? row['재산정점수']),
        sensitivity: Number(sens?.['시나리오_표준편차'] ?? 0),
      },

      isToheo: isToheoVal,
      ...(toheoUntilVal ? { toheoUntil: toheoUntilVal } : {}),
      ...(SPECIAL_NOTES[csvName]
        ? { specialNote: SPECIAL_NOTES[csvName] }
        : {}),

      source: 'eric_v2',
      lastUpdated: '2026-04-18',
    };

    results.push(record);
  }

  // 4. 강남구 등 Eric CSV에 없는 기존 레코드 → v1 데이터 보존
  const resultIds = new Set(results.map((r) => r.id));
  const preserved: string[] = [];

  for (const old of oldData) {
    if (resultIds.has(old.id)) continue;

    // 강남구 등 중요 지역 → v1 데이터를 v2 스키마로 래핑
    const wrapped: NewLocationScore = {
      id: old.id,
      name: old.name,
      district: old.district,
      lat: old.lat,
      lng: old.lng,
      region: old.region,
      level: old.level,
      ...(old.cityId ? { cityId: old.cityId } : {}),
      month: old.month,

      score: old.score,
      trend: old.trend,
      prevScore: old.prevScore,

      metrics: {
        pricePerPyeong: null,
        annualChange2025: null,
        weeklyChange2026: null,
        transport: 0,
        school: 0,
        industry: 0,
        supply: 0,
        jeonseRatio: null,
        populationFlow: 0,
        tradeVolumeChange: 0,
        unsold: 0,
        confidence: 'L',
      },

      scenarios: {
        base: old.score,
        price: old.score,
        growth: old.score,
        infra: old.score,
        sensitivity: 0,
      },

      isToheo: old.isToheo,
      ...(old.toheoUntil ? { toheoUntil: old.toheoUntil } : {}),
      specialNote: 'v1 데이터 보존 (Eric CSV에 미포함)',

      source: 'eric_v2',
      lastUpdated: old.month,
    };

    results.push(wrapped);
    preserved.push(`${old.name} (${old.id})`);
  }

  // 5. 정렬 (score 오름차순)
  results.sort((a, b) => a.score - b.score);

  // 6. 보고
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📋 마이그레이션 결과`);
  console.log(`   매칭 성공: ${matched}건`);
  console.log(`   매칭 실패: ${unmatched}건`);
  console.log(`   v1 보존: ${preserved.length}건`);
  console.log(`   총 출력: ${results.length}건`);

  console.log(`\n📍 region 분포:`);
  for (const [r, c] of Object.entries(regionCount).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`   ${r}: ${c}`);
  }

  console.log(`\n📐 level 분포: city=${cityCount}, district=${districtCount}`);

  if (unmatchedList.length > 0) {
    console.log(`\n⚠️  매칭 실패 목록:`);
    for (const u of unmatchedList) {
      console.log(`   - ${u}`);
    }
  }

  if (preserved.length > 0) {
    console.log(`\n📦 v1 보존 레코드:`);
    for (const p of preserved) {
      console.log(`   - ${p}`);
    }
  }

  // 7. 쓰기
  if (DRY_RUN) {
    console.log(`\n🔍 DRY-RUN 모드 — 파일 쓰기 생략`);
    // 샘플 3개 출력
    const samples = results.filter((r) =>
      ['gangnam-gu', 'bundang-gu', 'busan-haeundae'].includes(r.id),
    );
    if (samples.length > 0) {
      console.log(`\n📝 샘플 레코드:`);
      console.log(JSON.stringify(samples, null, 2));
    }
  } else {
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf-8');
    console.log(`\n✅ 저장 완료: ${outPath} (${results.length}건)`);
  }
}

main();
