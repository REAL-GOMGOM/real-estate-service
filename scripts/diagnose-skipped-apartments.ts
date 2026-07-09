import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { apartments } from '../lib/db/schema';

/**
 * 사이클 I 진단 — skipped 216건 원인 분류 + 분포 분석.
 * 읽기 전용. apartments 테이블 INSERT/UPDATE 없음.
 *
 * 입력:  data/skipped-list.json  (refetch-kapt-list.ts 산출물)
 * 출력:  data/skipped-analysis.json
 */

const INPUT_PATH  = 'data/skipped-list.json';
const OUTPUT_PATH = 'data/skipped-analysis.json';
const SAMPLE_PER_REASON = 5;
const DEVIATION_THRESHOLD = 2.0;
const BJD_CODE_LENGTH = 10;
const LAWD_CD_LENGTH  = 5;

const SKIP_REASONS = {
  REQUIRED_FIELD_NULL:  'required_field_null',
  LAWD_CD_INVALID:      'lawd_cd_invalid',
  NORMALIZATION_FAILED: 'normalization_failed',
  ENCODING_ISSUE:       'encoding_issue',
  DUPLICATE_KAPT_CODE:  'duplicate_kapt_code',
  OTHER:                'other',
} as const;

type SkipReason = typeof SKIP_REASONS[keyof typeof SKIP_REASONS];

interface SkippedRecord {
  kaptCode: string;
  name:     string;
  sido:     string;
  sigungu:  string;
  dong:     string;
  bjdCode:  string;
  raw:      Record<string, unknown>;
}

interface SkippedListFile {
  fetchedAt:    string;
  totalKaptApi: number;
  totalDb:      number;
  skippedCount: number;
  skipped:      SkippedRecord[];
}

// ─── 헬퍼 ───

/** 깨진 인코딩 패턴: 한글 영역 외의 알 수 없는 ASCII/제어 문자 비중 높음 */
function hasEncodingIssue(s: string): boolean {
  if (!s) return false;
  // 한글·영숫자·일반 기호 외의 패턴: � (replacement char), 제어 문자
  if (/�/.test(s)) return true;
  // 한글이 전혀 없고 영숫자 외 특수 문자 비중 높음 (간단한 휴리스틱)
  const hasHangul = /[가-힯]/.test(s);
  const weirdRatio = (s.match(/[^\w\s가-힯()\-./]/g) ?? []).length / Math.max(1, s.length);
  return !hasHangul && weirdRatio > 0.3;
}

function lawdCdFromBjd(bjd: string): string | null {
  if (!bjd || bjd.length !== BJD_CODE_LENGTH) return null;
  return bjd.substring(0, LAWD_CD_LENGTH);
}

function classify(rec: SkippedRecord, dupSet: Set<string>): {
  reason: SkipReason;
  details: string;
  missingFields: string[];
} {
  const missing: string[] = [];
  if (!rec.kaptCode) missing.push('kaptCode');
  if (!rec.name)     missing.push('name');
  if (!rec.sido)     missing.push('sido (as1)');
  if (!rec.sigungu)  missing.push('sigungu (as2)');

  const lawdCd = lawdCdFromBjd(rec.bjdCode);
  const bjdInvalid = !rec.bjdCode || rec.bjdCode.length !== BJD_CODE_LENGTH;

  // 1. 인코딩 — name에 깨진 패턴
  if (hasEncodingIssue(rec.name) || hasEncodingIssue(rec.sigungu)) {
    return {
      reason:        SKIP_REASONS.ENCODING_ISSUE,
      details:       `name="${rec.name}" sigungu="${rec.sigungu}"`,
      missingFields: missing,
    };
  }

  // 2. 중복 PK — refetch dedup 단계에서 발견
  if (rec.kaptCode && dupSet.has(rec.kaptCode)) {
    return {
      reason:        SKIP_REASONS.DUPLICATE_KAPT_CODE,
      details:       `kaptCode 중복 — refetch 시 동일 코드 ${dupSet.has(rec.kaptCode) ? '발견' : '없음'}`,
      missingFields: missing,
    };
  }

  // 3. 필수 필드 null
  if (missing.length > 0) {
    return {
      reason:        SKIP_REASONS.REQUIRED_FIELD_NULL,
      details:       `missing: ${missing.join(', ')}`,
      missingFields: missing,
    };
  }

  // 4. bjdCode/lawdCd 길이·형식 불량
  if (bjdInvalid || !lawdCd) {
    return {
      reason:        SKIP_REASONS.LAWD_CD_INVALID,
      details:       `bjdCode="${rec.bjdCode}" len=${rec.bjdCode?.length ?? 0}`,
      missingFields: missing,
    };
  }

  // 5. DISTRICT_CODE 매핑 가능 여부 (정규화 진단 — 적재 자체에는 영향 X, 검색 path 영향)
  // 매핑 못해도 적재는 됐을 것이므로, 여기 도달하면 다른 사유 — OTHER로
  return {
    reason:        SKIP_REASONS.OTHER,
    details:       `lawdCd=${lawdCd} sigungu="${rec.sigungu}" — 적재 스크립트 skip 사유 외`,
    missingFields: missing,
  };
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('[diagnose] DATABASE_URL 미설정');
    process.exit(1);
  }
  const db = drizzle(neon(url));

  const raw = readFileSync(INPUT_PATH, 'utf8');
  const input: SkippedListFile = JSON.parse(raw);
  console.log(`입력: ${input.skippedCount} skipped`);

  // 응답 자체에 같은 kaptCode가 두 번 등장하는지 (refetch가 dedupe했지만 진단상 추적)
  const codeFreq = new Map<string, number>();
  for (const r of input.skipped) {
    if (!r.kaptCode) continue;
    codeFreq.set(r.kaptCode, (codeFreq.get(r.kaptCode) ?? 0) + 1);
  }
  const dupSet = new Set([...codeFreq.entries()].filter(([, n]) => n > 1).map(([k]) => k));

  // ─── 분류 ───
  type Classified = SkippedRecord & {
    reason:        SkipReason;
    details:       string;
    missingFields: string[];
  };
  const classified: Classified[] = input.skipped.map((rec) => ({
    ...rec,
    ...classify(rec, dupSet),
  }));

  const byReason: Record<string, number> = {};
  const samples: Record<string, Classified[]> = {};
  for (const reason of Object.values(SKIP_REASONS)) {
    byReason[reason] = 0;
    samples[reason] = [];
  }
  for (const c of classified) {
    byReason[c.reason]++;
    if (samples[c.reason].length < SAMPLE_PER_REASON) {
      samples[c.reason].push(c);
    }
  }

  // ─── 분포 — DB 적재본 baseline ───
  const loadedBy = await db
    .select({ sido: apartments.sido, sigungu: apartments.sigungu, c: sql<number>`count(*)::int` })
    .from(apartments)
    .groupBy(apartments.sido, apartments.sigungu);

  const loadedSido = new Map<string, number>();
  for (const row of loadedBy) {
    loadedSido.set(row.sido, (loadedSido.get(row.sido) ?? 0) + row.c);
  }

  const skippedSido = new Map<string, number>();
  for (const c of classified) {
    const k = c.sido || '(unknown)';
    skippedSido.set(k, (skippedSido.get(k) ?? 0) + 1);
  }

  const totalLoaded = [...loadedSido.values()].reduce((a, b) => a + b, 0);
  const totalSkipped = classified.length;

  const sidoRows = [...new Set([...loadedSido.keys(), ...skippedSido.keys()])].sort();
  const distributionBySido: Record<string, {
    loaded: number; skipped: number;
    loadedShare: number; skippedShare: number;
    deviation: number;
  }> = {};
  const deviations: Array<{ region: string; loadedShare: number; skippedShare: number; deviation: number }> = [];
  for (const sido of sidoRows) {
    const l  = loadedSido.get(sido) ?? 0;
    const s  = skippedSido.get(sido) ?? 0;
    const ls = l / totalLoaded;
    const ss = s / Math.max(1, totalSkipped);
    const dev = ls > 0 ? ss / ls : (ss > 0 ? Infinity : 0);
    distributionBySido[sido] = {
      loaded: l, skipped: s,
      loadedShare:  Number(ls.toFixed(4)),
      skippedShare: Number(ss.toFixed(4)),
      deviation:    Number.isFinite(dev) ? Number(dev.toFixed(2)) : -1,
    };
    if (dev >= DEVIATION_THRESHOLD || (l === 0 && s > 0)) {
      deviations.push({
        region:       sido,
        loadedShare:  distributionBySido[sido].loadedShare,
        skippedShare: distributionBySido[sido].skippedShare,
        deviation:    distributionBySido[sido].deviation,
      });
    }
  }

  // 시군구별 — top deviation만
  const skippedSigungu = new Map<string, number>();
  for (const c of classified) {
    const k = `${c.sido} / ${c.sigungu}` || '(unknown)';
    skippedSigungu.set(k, (skippedSigungu.get(k) ?? 0) + 1);
  }
  const topSigungu = [...skippedSigungu.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([k, v]) => ({ region: k, skipped: v }));

  // ─── 출력 ───
  const out = {
    analyzedAt:   new Date().toISOString(),
    inputFile:    INPUT_PATH,
    totalSkipped: classified.length,
    totalLoaded,
    byReason,
    samples,
    distribution: {
      bySido:                 distributionBySido,
      topSkippedSigungu:      topSigungu,
      deviation:              deviations.sort((a, b) => b.deviation - a.deviation),
      deviationThreshold:     DEVIATION_THRESHOLD,
    },
    fullList: classified.map((c) => ({
      kaptCode:      c.kaptCode,
      name:          c.name,
      sido:          c.sido,
      sigungu:       c.sigungu,
      dong:          c.dong,
      bjdCode:       c.bjdCode,
      reason:        c.reason,
      details:       c.details,
      missingFields: c.missingFields,
    })),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log('');
  console.log(`분류 합계: ${classified.length} (입력 ${input.skippedCount}와 ${classified.length === input.skippedCount ? '일치' : '불일치 — 검토 필요'})`);
  console.log('byReason:', byReason);
  console.log(`산출물: ${OUTPUT_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[diagnose] 실패:', err);
    process.exit(1);
  });
