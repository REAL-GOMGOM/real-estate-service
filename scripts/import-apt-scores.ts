/**
 * 입지 점수 반영 — 사이클 MM (analysis 스코어링 산출물 → apt_scores)
 *
 * 입력 (analysis/ 디렉토리):
 *   - 아파트별_입지점수.csv       : 단지명·자치구·점수·역세권·초품아·브랜드·신뢰도
 *   - 자치구별_대장아파트.csv     : 지역 대장 플래그
 *   - 아파트별_API보강_*.csv     : K-apt 실측 (용적률·허용용적률·세대당주차·준공연도, 상태 OK 만)
 *
 * 동작:
 *   - apt_scores 테이블 생성(IF NOT EXISTS — drizzle push 회피 컨벤션)
 *   - apartments 마스터 매칭 (정확명 → aliases → 부분일치 최단명)
 *   - 기본 dry-run: 매칭 리포트만. --execute 로 upsert
 *
 * 실행 (Eric 터미널):
 *   npx tsx scripts/import-apt-scores.ts
 *   npx tsx scripts/import-apt-scores.ts --execute
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const ANALYSIS_DIR = path.join(process.cwd(), 'analysis');
const EXECUTE = process.argv.includes('--execute');

// ── env ──
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

/** 단순 CSV 파서 — 필드 내 콤마 없음 전제 (산출물 검증 완료), BOM 제거 */
function readCsv(file: string): Record<string, string>[] {
  const raw = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL 미설정'); process.exit(1); }
  const sql = neon(url);

  // 입력 로드
  const scoreRows = readCsv(path.join(ANALYSIS_DIR, '아파트별_입지점수.csv'));
  const topNames = new Set(
    readCsv(path.join(ANALYSIS_DIR, '자치구별_대장아파트.csv')).map((r) => r['단지명'])
  );
  const enrichFiles = fs.readdirSync(ANALYSIS_DIR).filter((f) => f.startsWith('아파트별_API보강_')).sort();
  const enrichByName = new Map<string, Record<string, string>>();
  if (enrichFiles.length) {
    for (const r of readCsv(path.join(ANALYSIS_DIR, enrichFiles[enrichFiles.length - 1]))) {
      if (r['상태'] === 'OK') enrichByName.set(r['단지명'], r);
    }
  }
  console.log(`입지점수 ${scoreRows.length}행 · 대장 ${topNames.size}곳 · K-apt 실측 ${enrichByName.size}건\n`);

  // 테이블 준비
  if (EXECUTE) {
    await sql`
      CREATE TABLE IF NOT EXISTS "apt_scores" (
        "id" text PRIMARY KEY NOT NULL,
        "master_id" text,
        "district" text NOT NULL,
        "score" real NOT NULL,
        "region_score" real NOT NULL,
        "is_region_top" boolean DEFAULT false NOT NULL,
        "confidence" text NOT NULL,
        "station_m" integer,
        "elem_school" boolean,
        "brand_score" integer,
        "far" real,
        "far_limit" real,
        "parking_per_hh" real,
        "build_year" integer,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS "apt_scores_master_id_idx" ON "apt_scores" ("master_id")`;
  }

  let matched = 0;
  const unmatched: string[] = [];

  for (const row of scoreRows) {
    const name = row['단지명'];
    if (!name) continue;

    // 단지 마스터 매칭 — 정확명 → 별칭 → 부분일치(최단명)
    let masterId: string | null = null;
    const exact = await sql`
      SELECT id FROM apartments
      WHERE name = ${name} OR aliases @> ${JSON.stringify([name])}::jsonb
      LIMIT 1
    `;
    if (exact.length) {
      masterId = exact[0].id as string;
    } else {
      const partial = await sql`
        SELECT id FROM apartments
        WHERE name ILIKE ${'%' + name + '%'} OR ${name} ILIKE '%' || name || '%'
        ORDER BY length(name) ASC LIMIT 1
      `;
      if (partial.length) masterId = partial[0].id as string;
    }
    if (masterId) matched++;
    else unmatched.push(name);

    const enrich = enrichByName.get(name);
    const values = {
      district:     row['자치구'] || row['지역key'] || '',
      score:        num(row['단지입지점수']) ?? 0,
      regionScore:  num(row['지역점수']) ?? 0,
      isTop:        topNames.has(name),
      confidence:   row['신뢰도'] || 'M',
      stationM:     num(row['역세권_m']),
      elemSchool:   row['초품아'] === '1' ? true : row['초품아'] === '0' ? false : null,
      brandScore:   num(row['브랜드']),
      far:          enrich ? num(enrich['용적률']) : null,
      farLimit:     enrich ? num(enrich['허용용적률']) : null,
      parkingPerHh: enrich ? num(enrich['세대당주차']) : null,
      buildYear:    enrich ? num(enrich['준공연도_API']) : null,
    };
    // 용적률 0 은 대장 미기재 — null 처리
    if (values.far !== null && values.far <= 0) { values.far = null; values.farLimit = null; }

    if (EXECUTE) {
      await sql`
        INSERT INTO apt_scores (
          id, master_id, district, score, region_score, is_region_top, confidence,
          station_m, elem_school, brand_score, far, far_limit, parking_per_hh, build_year
        ) VALUES (
          ${name}, ${masterId}, ${values.district}, ${values.score}, ${values.regionScore},
          ${values.isTop}, ${values.confidence}, ${values.stationM}, ${values.elemSchool},
          ${values.brandScore}, ${values.far}, ${values.farLimit}, ${values.parkingPerHh}, ${values.buildYear}
        )
        ON CONFLICT (id) DO UPDATE SET
          master_id = excluded.master_id,
          district = excluded.district,
          score = excluded.score,
          region_score = excluded.region_score,
          is_region_top = excluded.is_region_top,
          confidence = excluded.confidence,
          station_m = excluded.station_m,
          elem_school = excluded.elem_school,
          brand_score = excluded.brand_score,
          far = excluded.far,
          far_limit = excluded.far_limit,
          parking_per_hh = excluded.parking_per_hh,
          build_year = excluded.build_year,
          updated_at = now()
      `;
    }
  }

  console.log(`${EXECUTE ? '✅ 반영' : '🟡 dry-run'} — 총 ${scoreRows.length}건 · 마스터 매칭 ${matched}건`);
  if (unmatched.length) {
    console.log(`\n마스터 미매칭 ${unmatched.length}건 (이름 폴백으로 동작, 단지 페이지 연결만 제한):`);
    console.log('  ' + unmatched.join(', '));
  }
}

main();
