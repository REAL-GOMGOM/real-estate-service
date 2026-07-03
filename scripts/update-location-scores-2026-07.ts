/**
 * 지역 입지점수 2026-07 전면 업데이트 (126 → 145)
 *
 * 입력:
 *   - data/research/location-2026-07/입지등급_확장144_전체.csv (144개 지역, 재산정점수)
 *   - data/research/location-2026-07/scored_sensitivity.csv   (시나리오, no로 조인)
 *   - data/location-scores.json                                (현행 v2, 126개)
 *
 * 조인 규칙:
 *   - 두 CSV는 `no` 컬럼으로 결합 (sensitivity의 세분 region이 동명 구 판별 키)
 *   - 기존 데이터와는 정규화 이름(접미사 전체/(1기)/(2기)/(공공) 제거, 분당구→분당)으로 결합
 *   - 동명 구(중구×5 등)는 sensitivity region과 기존 region 일치로 판별
 *   - 기존 항목은 id·이름·좌표·토허 필드 보존, 점수·지표·시나리오만 갱신
 *   - `부산`(시 롤업)은 신규 데이터에 없음 → 기존 2026-04 항목 그대로 유지
 *
 * 실행:
 *   npx tsx scripts/update-location-scores-2026-07.ts            # dry-run
 *   npx tsx scripts/update-location-scores-2026-07.ts --execute  # 백업 후 적용
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const RESEARCH_DIR = path.join('data', 'research', 'location-2026-07');
const SCORES_PATH = path.join('data', 'location-scores.json');
const BACKUP_PATH = path.join('data', 'location-scores.2026-04.backup.json');

const NEW_MONTH = '2026-07';
const NEW_LAST_UPDATED = '2026-07-03';
const NEW_SOURCE = 'eric_v3';
// 2026-07 회차는 시그모이드 재캘리브레이션으로 전 지역 약 -0.09 시스템 시프트 존재.
// 시장 변화가 아닌 모델 변경이 up/down 으로 표시되지 않도록 노이즈 흡수 임계 0.1 적용.
const TREND_EPSILON = 0.1;

interface Metrics {
  // 3기 신도시(미입주)는 평당가·전세가율 부재 → null (기존 v2 규약)
  pricePerPyeong: number | null;
  annualChange2025: number;
  weeklyChange2026: number;
  transport: number;
  school: number;
  industry: number;
  supply: number;
  jeonseRatio: number | null;
  populationFlow: number;
  tradeVolumeChange: number;
  unsold: number;
  confidence: string;
}

interface Scenarios {
  base: number;
  price: number;
  growth: number;
  infra: number;
  sensitivity: number;
}

interface RegionScore {
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
  trend: string;
  prevScore: number;
  metrics: Metrics;
  scenarios: Scenarios;
  isToheo: boolean;
  toheoUntil?: string;
  source: string;
  lastUpdated: string;
  specialNote?: string;
}

// 단순 CSV 파서 — 본 데이터셋은 인용부호/내장 콤마 없음 (사전 검증 완료)
function parseCsv(filePath: string): Record<string, string>[] {
  const raw = readFileSync(filePath, 'utf-8').replace(/^﻿/, '');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function normName(name: string): string {
  let n = name.trim();
  n = n.replace(/\((1기|2기|공공)\)$/, '');
  n = n.replace(/전체$/, '');
  if (n === '분당구') n = '분당';
  return n;
}

// 신규 편입 20개 지역 메타 (좌표: 구청·시청 소재 기준, 지도 마커용)
const NEW_REGION_META: Record<string, {
  id: string; district: string; region: string; level: 'city' | 'district';
  lat: number; lng: number;
}> = {
  광주동구:   { id: 'gwangju-dong',      district: '동구',   region: '광주', level: 'district', lat: 35.146, lng: 126.9232 },
  광주서구:   { id: 'gwangju-seo',       district: '서구',   region: '광주', level: 'district', lat: 35.1518, lng: 126.8895 },
  광주남구:   { id: 'gwangju-nam',       district: '남구',   region: '광주', level: 'district', lat: 35.1328, lng: 126.9025 },
  광주북구:   { id: 'gwangju-buk',       district: '북구',   region: '광주', level: 'district', lat: 35.174, lng: 126.912 },
  광주광산구: { id: 'gwangju-gwangsan',  district: '광산구', region: '광주', level: 'district', lat: 35.1396, lng: 126.7936 },
  대전중구:   { id: 'daejeon-jung',      district: '중구',   region: '대전', level: 'district', lat: 36.3255, lng: 127.4214 },
  대전동구:   { id: 'daejeon-dong',      district: '동구',   region: '대전', level: 'district', lat: 36.312, lng: 127.4548 },
  대전서구:   { id: 'daejeon-seo',       district: '서구',   region: '대전', level: 'district', lat: 36.3554, lng: 127.3838 },
  대전유성구: { id: 'daejeon-yuseong',   district: '유성구', region: '대전', level: 'district', lat: 36.3622, lng: 127.3561 },
  대전대덕구: { id: 'daejeon-daedeok',   district: '대덕구', region: '대전', level: 'district', lat: 36.3466, lng: 127.4157 },
  세종시:     { id: 'sejong-city',       district: '세종시', region: '세종', level: 'city', lat: 36.4801, lng: 127.289 },
  송도국제도시: { id: 'songdo-city',     district: '송도국제도시', region: '인천', level: 'city', lat: 37.3825, lng: 126.6564 },
  전주완산구: { id: 'jeonju-wansan',     district: '완산구', region: '전북', level: 'district', lat: 35.812, lng: 127.1205 },
  전주덕진구: { id: 'jeonju-deokjin',    district: '덕진구', region: '전북', level: 'district', lat: 35.831, lng: 127.121 },
  창원의창구: { id: 'changwon-uichang',  district: '의창구', region: '경남', level: 'district', lat: 35.254, lng: 128.6402 },
  창원성산구: { id: 'changwon-seongsan', district: '성산구', region: '경남', level: 'district', lat: 35.218, lng: 128.7016 },
  청주상당구: { id: 'cheongju-sangdang', district: '상당구', region: '충북', level: 'district', lat: 36.635, lng: 127.489 },
  청주흥덕구: { id: 'cheongju-heungdeok', district: '흥덕구', region: '충북', level: 'district', lat: 36.641, lng: 127.432 },
  김해시:     { id: 'gimhae-city',       district: '김해시', region: '경남', level: 'city', lat: 35.2285, lng: 128.8894 },
  아산시:     { id: 'asan-city',         district: '아산시', region: '충남', level: 'city', lat: 36.7898, lng: 127.0018 },
};

// sensitivity의 세분 region → 기존 v2 region 후보군 (동명 구 판별용)
function regionCompatible(sensRegion: string, oldRegion: string): boolean {
  if (sensRegion === oldRegion) return true;
  const gyeonggiCities = [
    '고양', '과천', '광명', '구리', '군포', '김포', '남양주', '부천', '성남', '수원',
    '시흥', '안산', '안양', '용인', '의왕', '의정부', '파주', '평택', '하남', '화성',
  ];
  if (gyeonggiCities.includes(sensRegion) && oldRegion === '경기') return true;
  if (['신도시', '2기', '3기', '기타'].includes(sensRegion) && /신도시$/.test(oldRegion)) return true;
  return false;
}

function num(v: string): number {
  const n = parseFloat(v);
  if (Number.isNaN(n)) throw new Error(`숫자 파싱 실패: "${v}"`);
  return n;
}

/** 빈 셀 허용 필드용 (3기 신도시 평당가·전세가율) — 기존 v2 규약은 null */
function numOrNull(v: string): number | null {
  return v.trim() === '' ? null : num(v);
}

function buildMetrics(row: Record<string, string>): Metrics {
  return {
    pricePerPyeong: numOrNull(row['평당가']),
    annualChange2025: num(row['매매누계_2025']),
    weeklyChange2026: num(row['주간지수_2026']),
    transport: num(row['교통']),
    school: num(row['학군']),
    industry: num(row['산업']),
    supply: num(row['공급']),
    jeonseRatio: numOrNull(row['전세가율']),
    populationFlow: num(row['인구순이동']),
    tradeVolumeChange: num(row['거래량증감']),
    unsold: num(row['미분양']),
    confidence: row['신뢰도'],
  };
}

function trendOf(newScore: number, oldScore: number): string {
  const delta = newScore - oldScore;
  if (Math.abs(delta) < TREND_EPSILON) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

function main() {
  const execute = process.argv.includes('--execute');

  const mainRows = parseCsv(path.join(RESEARCH_DIR, '입지등급_확장144_전체.csv'));
  const sensRows = parseCsv(path.join(RESEARCH_DIR, 'scored_sensitivity.csv'));
  const old: RegionScore[] = JSON.parse(readFileSync(SCORES_PATH, 'utf-8'));

  const sensByNo = new Map(sensRows.map((r) => [r['no'], r]));

  // 기존 데이터 인덱스: 정규화 이름 → 후보 목록
  const oldByNorm = new Map<string, RegionScore[]>();
  for (const o of old) {
    const k = normName(o.name);
    if (!oldByNorm.has(k)) oldByNorm.set(k, []);
    oldByNorm.get(k)!.push(o);
  }

  const result: RegionScore[] = [];
  const consumedOldIds = new Set<string>();
  const report = { updated: 0, added: 0, kept: 0, ambiguousResolved: [] as string[], errors: [] as string[] };
  const deltas: { name: string; old: number; new: number; delta: number }[] = [];

  for (const row of mainRows) {
    const rawName = row['name'].trim();
    const norm = normName(rawName);
    const sens = sensByNo.get(row['no']);
    if (!sens) { report.errors.push(`sensitivity 조인 실패: no=${row['no']} ${rawName}`); continue; }
    if (sens['name'].trim() !== rawName) {
      report.errors.push(`no=${row['no']} 이름 불일치: main="${rawName}" sens="${sens['name']}"`);
      continue;
    }

    const newScore = num(row['재산정점수']);
    const scenarios: Scenarios = {
      base: num(sens['점수_Base']),
      price: num(sens['점수_Price']),
      growth: num(sens['점수_Growth']),
      infra: num(sens['점수_Infra']),
      sensitivity: num(sens['시나리오_표준편차']),
    };
    const metrics = buildMetrics(row);

    // 기존 항목 매칭
    const candidates = (oldByNorm.get(norm) ?? []).filter((o) => !consumedOldIds.has(o.id));
    let matched: RegionScore | undefined;
    if (candidates.length === 1) {
      matched = candidates[0];
    } else if (candidates.length > 1) {
      const byRegion = candidates.filter((o) => regionCompatible(sens['region'].trim(), o.region));
      if (byRegion.length === 1) {
        matched = byRegion[0];
        report.ambiguousResolved.push(`${rawName}(${sens['region']}) → ${matched.id}`);
      } else {
        report.errors.push(`동명 판별 실패: ${rawName} sens=${sens['region']} 후보=${candidates.map((c) => c.id).join(',')}`);
        continue;
      }
    }

    if (matched) {
      consumedOldIds.add(matched.id);
      deltas.push({ name: matched.name, old: matched.score, new: newScore, delta: +(newScore - matched.score).toFixed(2) });
      result.push({
        ...matched,
        score: newScore,
        prevScore: matched.score,
        trend: trendOf(newScore, matched.score),
        metrics,
        scenarios,
        month: NEW_MONTH,
        lastUpdated: NEW_LAST_UPDATED,
        source: NEW_SOURCE,
      });
      report.updated += 1;
    } else {
      const meta = NEW_REGION_META[rawName];
      if (!meta) { report.errors.push(`신규 지역 메타 없음: ${rawName}`); continue; }
      result.push({
        id: meta.id,
        name: rawName,
        district: meta.district,
        lat: meta.lat,
        lng: meta.lng,
        region: meta.region,
        level: meta.level,
        month: NEW_MONTH,
        score: newScore,
        trend: 'flat',
        prevScore: newScore,
        metrics,
        scenarios,
        isToheo: false,
        source: NEW_SOURCE,
        lastUpdated: NEW_LAST_UPDATED,
      });
      report.added += 1;
    }
  }

  // 신규 데이터에 없는 기존 항목 → 그대로 유지 (부산 시 롤업 등)
  for (const o of old) {
    if (!consumedOldIds.has(o.id)) {
      result.push(o);
      report.kept += 1;
      console.log(`[keep] ${o.id} (${o.name}) — 신규 데이터 없음, ${o.month} 데이터 유지`);
    }
  }

  // ── 보고 ──
  console.log(`\n[update] 갱신 ${report.updated} / 신규 ${report.added} / 유지 ${report.kept} → 총 ${result.length}건`);
  console.log(`[update] 동명 구 판별: ${report.ambiguousResolved.length}건`);
  for (const a of report.ambiguousResolved) console.log(`  · ${a}`);

  const trends = result.reduce<Record<string, number>>((acc, r) => {
    acc[r.trend] = (acc[r.trend] ?? 0) + 1; return acc;
  }, {});
  console.log('[update] trend 분포:', JSON.stringify(trends));

  deltas.sort((a, b) => a.delta - b.delta);
  console.log('\n[update] 점수 개선 TOP 5 (delta 음수 = 순위 개선):');
  for (const d of deltas.slice(0, 5)) console.log(`  ${d.name}: ${d.old} → ${d.new} (${d.delta})`);
  console.log('[update] 점수 하락 TOP 5:');
  for (const d of deltas.slice(-5).reverse()) console.log(`  ${d.name}: ${d.old} → ${d.new} (+${d.delta})`);

  if (report.errors.length > 0) {
    console.error(`\n[update] ⚠️ 오류 ${report.errors.length}건:`);
    for (const e of report.errors) console.error(`  ${e}`);
    process.exit(1);
  }

  if (!execute) {
    console.log('\n[update] dry-run 종료 — 적용은 --execute');
    return;
  }

  if (!existsSync(BACKUP_PATH)) {
    writeFileSync(BACKUP_PATH, readFileSync(SCORES_PATH, 'utf-8'), 'utf-8');
    console.log(`[update] 백업 완료: ${BACKUP_PATH}`);
  } else {
    console.log(`[update] 백업 이미 존재 (미덮어씀): ${BACKUP_PATH}`);
  }
  writeFileSync(SCORES_PATH, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[update] 적용 완료: ${SCORES_PATH} (${result.length}건)`);
}

main();
