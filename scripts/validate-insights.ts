/**
 * AI 해설 팩트 검증 스크립트
 *
 * location-insights.json의 해설을 location-scores.json (Eric v2)과 대조하여
 * GTX 남발, 3기 과장, 규제 오기, 톤 불일치, 지리 오류 등을 자동 탐지.
 *
 * 사용법: npx tsx scripts/validate-insights.ts
 * 출력:   data/insights-validation-report.json
 */

import fs from 'fs';
import path from 'path';

// ── 타입 ──

interface LocationInsight {
  id: string;
  headline: string;
  summary: string;
  tags: string[];
  scoreAtGeneration: number;
}

interface LocationScore {
  id: string;
  name: string;
  region: string;
  level: 'city' | 'district';
  score: number;
  trend: 'up' | 'down' | 'flat';
  prevScore: number;
  metrics: {
    weeklyChange2026: number | null;
    [k: string]: unknown;
  };
  isToheo: boolean;
  specialNote?: string;
}

type RuleName =
  | 'gtx_misuse'
  | '3gi_exaggeration'
  | 'regulation_mismatch'
  | 'tone_mismatch'
  | 'trend_mismatch'
  | 'geographic_error'
  | 'orphan';

interface ValidationIssue {
  insightId: string;
  name: string;
  region: string;
  severity: 'high' | 'medium' | 'low';
  rule: RuleName;
  detail: string;
  suggestedAction: 'regenerate' | 'discard' | 'manual_review';
  originalText: string;
}

// ── GTX 노선 데이터 ──

const GTX_ROUTES: Record<string, Set<string>> = {
  'GTX-A': new Set([
    '파주', '파주시', '파주운정', '일산', '고양시', '덕양구', '일산동구', '일산서구',
    '은평구', '서대문구', '종로구', '강남구', '서초구', '송파구',
    '성남시', '분당구', '분당', '수정구', '용인시', '수지구', '기흥구',
    '화성시', '동탄', '서울전체', '서울',
  ]),
  'GTX-B': new Set([
    '인천전체', '인천', '연수구', '부평구', '계양구',
    '용산구', '성동구', '광진구', '중랑구', '동대문구',
    '남양주시', '구리시', '별내', '서울전체', '서울',
  ]),
  'GTX-C': new Set([
    '의정부시', '양주', '노원구', '동대문구', '성동구',
    '강남구', '과천시', '안양시', '동안구', '평촌',
    '수원시', '영통구', '팔달구', '서울전체', '서울',
  ]),
  // GTX-D: 노선 미확정 → 언급 자체가 경고
};

// ── 3기신도시 공정률 (2025.11 머니투데이) ──

const NEWTOWN_3GI_PROGRESS: Record<string, string> = {
  계양: '35% (유일하게 의미있는 수준)',
  창릉: '8~10%',
  대장: '5%',
  왕숙: '0.5~1%',
  교산: '0%',
  광명시흥: '보상공고 단계 (0%)',
  장상: '중소 공공주택지구',
  청계: '중소 공공주택지구',
};

// ── 지리 오류 패턴 ──

const GEO_ERRORS: { name: string; pattern: RegExp; reason: string }[] = [
  { name: '동구', pattern: /송도.*근접|송도.*인접/i, reason: '인천 동구는 내륙, 송도는 연수구' },
  { name: '강서구', pattern: /해운대.*인접|해운대.*근접|동부/i, reason: '부산 강서구는 낙동강 서안' },
  { name: '강동구', pattern: /동북권/i, reason: '강동구는 동남권 (서울 남동쪽)' },
  { name: '부평구', pattern: /서부/i, reason: '부평구는 인천 중앙·동부권' },
  { name: '계양구', pattern: /서부/i, reason: '계양구는 인천 동북부' },
  { name: '미추홀구', pattern: /서부/i, reason: '미추홀구는 인천 중앙부' },
  { name: '단원구', pattern: /인천/i, reason: '단원구는 안산시 소속 (인천 아님)' },
  { name: '남동구', pattern: /공항.*송도.*관문|송도.*연계.*관문/i, reason: '남동구는 내륙 (인천시청 소재)' },
];

// ── 체크 함수들 ──

function checkGtxMisuse(
  insight: LocationInsight,
  score: LocationScore,
  issues: ValidationIssue[],
) {
  const text = insight.headline + ' ' + insight.summary;

  // GTX-D 언급 → 무조건 경고 (노선 미확정)
  if (/GTX-D/i.test(text)) {
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'high',
      rule: 'gtx_misuse',
      detail: 'GTX-D는 2026년 현재 노선 미확정 — 언급 자체가 오류',
      suggestedAction: 'regenerate',
      originalText: extractContext(text, /GTX-D/i),
    });
  }

  // GTX-A/B/C 언급 확인
  for (const [line, stations] of Object.entries(GTX_ROUTES)) {
    const regex = new RegExp(line, 'gi');
    if (regex.test(text)) {
      if (!stations.has(score.name)) {
        issues.push({
          insightId: insight.id,
          name: score.name,
          region: score.region,
          severity: 'high',
          rule: 'gtx_misuse',
          detail: `${line} 언급하지만 ${score.name}은(는) ${line} 노선 미경유`,
          suggestedAction: 'regenerate',
          originalText: extractContext(text, regex),
        });
      }
    }
  }

  // "GTX 개통 임박", "GTX 호재" 등 모호한 GTX 언급
  if (/GTX(?!-[A-D])[\s·]*(?:개통|호재|수혜|연장)/i.test(text)) {
    // 어떤 GTX 노선인지 안 밝히고 모호하게 사용
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'medium',
      rule: 'gtx_misuse',
      detail: 'GTX 노선명 없이 모호하게 "GTX 호재/수혜" 언급',
      suggestedAction: 'regenerate',
      originalText: extractContext(text, /GTX/i),
    });
  }
}

function check3giExaggeration(
  insight: LocationInsight,
  score: LocationScore,
  issues: ValidationIssue[],
) {
  if (score.region !== '3기신도시') return;

  const text = insight.headline + ' ' + insight.summary;
  const progressPatterns = /본격\s*조성|개발\s*본격|입주\s*임박|완공\s*가시/i;

  if (progressPatterns.test(text)) {
    const progress = NEWTOWN_3GI_PROGRESS[score.name];
    // 계양만 35%로 "본격"이 일부 허용
    if (score.name !== '계양') {
      issues.push({
        insightId: insight.id,
        name: score.name,
        region: score.region,
        severity: 'medium',
        rule: '3gi_exaggeration',
        detail: `"본격 조성" 표현이나 실제 공정률: ${progress ?? '미확인'}`,
        suggestedAction: 'regenerate',
        originalText: extractContext(text, progressPatterns),
      });
    }
  }
}

function checkRegulationMismatch(
  insight: LocationInsight,
  score: LocationScore,
  issues: ValidationIssue[],
) {
  const text = insight.headline + ' ' + insight.summary;

  if (score.isToheo && /규제\s*(?:없|부재|비대상|해제)/i.test(text)) {
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'high',
      rule: 'regulation_mismatch',
      detail: '토허제 대상인데 "규제 없음" 표현',
      suggestedAction: 'regenerate',
      originalText: extractContext(text, /규제/i),
    });
  }

  if (
    !score.isToheo &&
    /토지거래허가|토허제|규제\s*지역/i.test(text)
  ) {
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'medium',
      rule: 'regulation_mismatch',
      detail: '토허제 비대상인데 토허제 언급',
      suggestedAction: 'regenerate',
      originalText: extractContext(text, /토지거래허가|토허제|규제\s*지역/i),
    });
  }
}

function checkToneMismatch(
  insight: LocationInsight,
  score: LocationScore,
  issues: ValidationIssue[],
) {
  const text = insight.headline + ' ' + insight.summary;

  // 최상급지(≤1.9)인데 "중급지", "재평가" 톤
  if (score.score <= 1.9 && /중급지|하급지|재평가|재발견/i.test(text)) {
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'low',
      rule: 'tone_mismatch',
      detail: `score ${score.score} (최상급)인데 톤이 "중급/재평가"`,
      suggestedAction: 'manual_review',
      originalText: extractContext(
        text,
        /중급지|하급지|재평가|재발견/i,
      ),
    });
  }

  // 하급지(≥4.0)인데 "상승세", "강세", "상급지" 톤
  if (
    score.score >= 4.0 &&
    /상승세|강세|상급지|최상급|프리미엄/i.test(text)
  ) {
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'medium',
      rule: 'tone_mismatch',
      detail: `score ${score.score} (하급지)인데 톤이 "상승/강세/상급"`,
      suggestedAction: 'regenerate',
      originalText: extractContext(
        text,
        /상승세|강세|상급지|최상급|프리미엄/i,
      ),
    });
  }
}

function checkTrendMismatch(
  insight: LocationInsight,
  score: LocationScore,
  issues: ValidationIssue[],
) {
  const text = insight.headline + ' ' + insight.summary;
  const weekly = score.metrics.weeklyChange2026;
  if (weekly === null) return;

  // 하락(-0.05 이하)인데 "상승세", "회복"
  if (weekly < -0.05 && /상승세|회복|반등|호조/i.test(text)) {
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'medium',
      rule: 'trend_mismatch',
      detail: `주간변동 ${weekly}% (하락)인데 "상승/회복" 표현`,
      suggestedAction: 'regenerate',
      originalText: extractContext(text, /상승세|회복|반등|호조/i),
    });
  }

  // 강세(+0.2 이상)인데 "정체", "침체"
  if (weekly > 0.2 && /정체|침체|약세|둔화/i.test(text)) {
    issues.push({
      insightId: insight.id,
      name: score.name,
      region: score.region,
      severity: 'medium',
      rule: 'trend_mismatch',
      detail: `주간변동 +${weekly}% (강세)인데 "정체/침체" 표현`,
      suggestedAction: 'regenerate',
      originalText: extractContext(text, /정체|침체|약세|둔화/i),
    });
  }
}

function checkGeographicError(
  insight: LocationInsight,
  score: LocationScore,
  issues: ValidationIssue[],
) {
  const text = insight.headline + ' ' + insight.summary;

  for (const geo of GEO_ERRORS) {
    if (score.name === geo.name && geo.pattern.test(text)) {
      issues.push({
        insightId: insight.id,
        name: score.name,
        region: score.region,
        severity: 'high',
        rule: 'geographic_error',
        detail: geo.reason,
        suggestedAction: 'regenerate',
        originalText: extractContext(text, geo.pattern),
      });
    }
  }
}

// ── 유틸 ──

function extractContext(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  if (!match || match.index === undefined) return text.slice(0, 80);
  const start = Math.max(0, match.index - 20);
  const end = Math.min(text.length, match.index + match[0].length + 20);
  return '...' + text.slice(start, end) + '...';
}

// ── 메인 ──

function main() {
  const insightsPath = path.join(process.cwd(), 'data/location-insights.json');
  const scoresPath = path.join(process.cwd(), 'data/location-scores.json');
  const outPath = path.join(
    process.cwd(),
    'data/insights-validation-report.json',
  );

  const insights: LocationInsight[] = JSON.parse(
    fs.readFileSync(insightsPath, 'utf-8'),
  );
  const scores: LocationScore[] = JSON.parse(
    fs.readFileSync(scoresPath, 'utf-8'),
  );
  const scoreMap = new Map(scores.map((s) => [s.id, s]));

  const issues: ValidationIssue[] = [];

  for (const insight of insights) {
    const score = scoreMap.get(insight.id);
    if (!score) {
      issues.push({
        insightId: insight.id,
        name: '???',
        region: '???',
        severity: 'high',
        rule: 'orphan',
        detail: 'location-scores.json에 해당 id 없음',
        suggestedAction: 'discard',
        originalText: insight.headline,
      });
      continue;
    }

    checkGtxMisuse(insight, score, issues);
    check3giExaggeration(insight, score, issues);
    checkRegulationMismatch(insight, score, issues);
    checkToneMismatch(insight, score, issues);
    checkTrendMismatch(insight, score, issues);
    checkGeographicError(insight, score, issues);
  }

  // 저장
  fs.writeFileSync(outPath, JSON.stringify(issues, null, 2), 'utf-8');

  // 요약 출력
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📋 AI 해설 검증 결과`);
  console.log(`${'═'.repeat(50)}`);
  console.log(`총 검증: ${insights.length}개`);
  console.log(`이슈 발견: ${issues.length}건`);

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const i of issues)
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
  console.log(
    `  🔴 high: ${bySeverity.high} | 🟡 medium: ${bySeverity.medium} | 🔵 low: ${bySeverity.low}`,
  );

  console.log(`\n📊 규칙별 발생:`);
  const byRule: Record<string, number> = {};
  for (const i of issues) byRule[i.rule] = (byRule[i.rule] ?? 0) + 1;
  for (const [rule, count] of Object.entries(byRule).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${rule}: ${count}건`);
  }

  console.log(`\n🔧 권장 조치:`);
  const byAction: Record<string, number> = {};
  for (const i of issues)
    byAction[i.suggestedAction] = (byAction[i.suggestedAction] ?? 0) + 1;
  for (const [action, count] of Object.entries(byAction)) {
    console.log(`  ${action}: ${count}건`);
  }

  // high severity 상세
  const highIssues = issues.filter((i) => i.severity === 'high');
  if (highIssues.length > 0) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🔴 HIGH severity 상세:`);
    for (const i of highIssues) {
      console.log(`  [${i.rule}] ${i.name} (${i.region})`);
      console.log(`    ${i.detail}`);
      console.log(`    "${i.originalText}"`);
    }
  }

  console.log(`\n✅ 보고서 저장: ${outPath}`);
}

main();
