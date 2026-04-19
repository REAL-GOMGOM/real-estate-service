/**
 * 입지 점수 AI 해설 생성 스크립트 (v2 — Eric 검증 데이터 기반)
 *
 * 사용법:
 *   npm run generate:insights                               # 변경분만
 *   npm run generate:insights -- --force                     # 전체 재생성
 *   npm run generate:insights -- --sample=gangnam-gu,bundang-1st --force
 *   npm run generate:insights -- --limit 3
 *
 * data/location-scores.json (Eric v2) → Claude Haiku → data/location-insights.json
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY가 설정되지 않았습니다.');
  console.error('   .env.local 파일에 ANTHROPIC_API_KEY=sk-ant-... 형식으로 추가하세요.');
  process.exit(1);
}

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

// ── 타입 (v2 — Eric 메트릭 포함) ──

interface LocationScore {
  id: string;
  name: string;
  district: string;
  score: number;
  trend: 'up' | 'down' | 'flat';
  prevScore: number;
  month: string;
  isToheo: boolean;
  toheoUntil?: string;
  region: string;
  level: 'city' | 'district';
  specialNote?: string;
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
}

export interface LocationInsight {
  id: string;
  headline: string;
  summary: string;
  tags: string[];
  generatedAt: string;
  scoreAtGeneration: number;
}

// ── CLI 인자 ──

function parseLimit(): number | null {
  const idx = process.argv.indexOf('--limit');
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  const n = parseInt(process.argv[idx + 1], 10);
  return isNaN(n) || n <= 0 ? null : n;
}

function parseSample(): string[] | null {
  const arg = process.argv.find((a) => a.startsWith('--sample='));
  if (!arg) return null;
  const ids = arg.split('=')[1].split(',').filter(Boolean);
  return ids.length > 0 ? ids : null;
}

const FORCE = process.argv.includes('--force');

// ── 프롬프트 (v2 — Eric 검증 데이터 주입) ──

function buildPrompt(loc: LocationScore): string {
  const m = loc.metrics;
  const s = loc.scenarios;

  const tier =
    loc.score <= 1.9
      ? '최상급지'
      : loc.score <= 2.9
        ? '상급지'
        : loc.score <= 3.5
          ? '중급지'
          : loc.score <= 4.0
            ? '중하급지'
            : '하급지';

  const trendText =
    m.weeklyChange2026 === null
      ? '데이터 없음'
      : m.weeklyChange2026 > 0.2
        ? `강세 (주간 +${m.weeklyChange2026.toFixed(2)}%)`
        : m.weeklyChange2026 > 0
          ? `소폭 상승 (+${m.weeklyChange2026.toFixed(2)}%)`
          : m.weeklyChange2026 > -0.05
            ? `보합 (${m.weeklyChange2026.toFixed(2)}%)`
            : `하락 (${m.weeklyChange2026.toFixed(2)}%)`;

  const regText = loc.isToheo
    ? `토지거래허가구역 (~${loc.toheoUntil ?? '기한 미정'})`
    : '별도 규제 없음';

  const sensitivityText =
    s.sensitivity < 0.1
      ? '시나리오별 점수 안정 (가중치 변화에도 등급 불변)'
      : s.sensitivity > 0.15
        ? '시나리오별 편차 큼 (가중치에 따라 등급 변동)'
        : '시나리오 보통';

  const perspective: Record<string, string> = {
    서울: '서울 25개 구 내 상대적 위상, 3대 업무지구(강남·여의도·종로) 접근성 관점',
    경기: '서울 업무지구 접근성, 경기 내 주요 권역(판교·분당·광명) 대비 위상',
    인천: '서울 서부 접근성, 송도·청라 등 주요 거점과의 관계',
    '1기신도시': '성숙한 생활 인프라, 재건축 가능성, 서울 접근성',
    '2기신도시': '개발 성숙 단계, 서울 핵심 업무지구와의 거리',
    '3기신도시': '개발 초기 단계 (실제 공정률 반영)',
    부산: '3대 권역(해운대·서면·동래) 대비 위상',
    대구: '수성구 중심 구조 내 위상',
    울산: '산업단지 의존도 및 자족성',
  };
  const persp = perspective[loc.region] ?? '지역 내 상대적 위상';

  const priceStr =
    m.pricePerPyeong !== null
      ? `${m.pricePerPyeong.toLocaleString()}만원/평`
      : '데이터 없음';
  const annualStr =
    m.annualChange2025 !== null
      ? `${m.annualChange2025 >= 0 ? '+' : ''}${m.annualChange2025}%`
      : '데이터 없음';
  const jeonseStr =
    m.jeonseRatio !== null ? `${m.jeonseRatio}%` : '데이터 없음';
  const popStr = `${m.populationFlow > 0 ? '+' : ''}${m.populationFlow}명/월`;

  return `당신은 한국 부동산 입지 분석가입니다. 아래 검증된 데이터를 바탕으로 해설을 작성하세요.

[검증된 데이터 — 이 값만 사용]
- 지역: ${loc.name} (${loc.region})
- 입지 점수: ${loc.score} (1.0~5.0, 낮을수록 상급) — ${tier}
- 원본 AI 점수: ${loc.prevScore} → 재산정: ${loc.score}
- 평당가: ${priceStr}
- 2025 연간 누계: ${annualStr}
- 최근 주간 추세: ${trendText}
- 전세가율: ${jeonseStr}
- 인구순이동: ${popStr}
- 교통 지수: ${m.transport}/10
- 학군 지수: ${m.school}/10
- 산업·일자리 지수: ${m.industry}/10
- 공급·재개발 지수: ${m.supply}/10
- 규제: ${regText}
- 데이터 신뢰도: ${m.confidence}
- 시나리오 민감도: ${sensitivityText}

[지역 유형별 관점]
${persp}

[⚠️ 절대 금지 — 할루시네이션 차단]
다음은 과거에 자주 발생한 오류. 반드시 피할 것:
1. 위 데이터에 없는 교통망 언급 금지. 특히:
   - GTX-A: 파주시·파주운정·일산·은평·서대문·종로·강남·서초·송파·성남·분당·수지·기흥·동탄만 해당
   - GTX-B: 인천 송도·부평·남양주·구리만 해당
   - GTX-C: 의정부·양주·노원·동대문·강남·과천·수원만 해당
   - GTX-D: 2026년 현재 노선 미확정 → "개통 임박"·"확정" 절대 금지
   위 목록에 이 지역(${loc.name})이 없으면 GTX 일체 언급하지 말 것
2. 확정되지 않은 재건축·재개발 단계를 구체 언급 금지
3. 3기 신도시 공정률 과장 금지:
   - 계양만 35%, 창릉 8~10%, 대장 5%, 왕숙·교산·광명시흥 0~1%
   - 장상·청계는 중소 공공주택지구 (3기 본격 아님)
4. 토허제 상태 오기 금지 — 위 데이터의 '규제' 필드와 일치해야 함
5. 지리적 오류 금지 — 다음 권역별 방향 정보를 반드시 따를 것:

[서울]
강동구=동남권(동북권아님) / 강서구=서부(김포공항) / 송파·강남·서초=남부·동남권(강남3구)
광진구=동부 / 성동구=동부한강변 / 영등포·양천·구로·금천=서남권
종로·중구·용산=도심권 / 마포·서대문·은평=서북권 / 강북·도봉·노원·중랑=동북권 / 관악·동작=남부

[인천]
중구=구도심(동인천)+영종도(공항) / 동구=도심동쪽내륙(공항·송도와거리있음)
미추홀구=중앙부(구남구,주안동) / 남동구=남동부(시청소재) / 연수구=남부(송도)
부평구=동부(경인선축,서울접근관문) / 계양구=북동부(김포공항인근) / 서구=서북부(검단·청라)

[부산]
해운대·수영=동부해안 / 동래·금정·연제=동부내륙 / 부산진·동구·서구·중구·영도=중부(서면·원도심)
남구=남부해안 / 강서구=서부(낙동강서안·명지,해운대·서면모두거리있음) / 북구·사상=서북부 / 사하=서남부 / 기장군=동북부

[대구]
수성구=동부(학군1위) / 중구·동구=도심 / 달서구=서남부(최대거주지) / 달성군·군위군=외곽

[울산]
남구=삼산동·옥동(행정·상업중심,산업단지와별개) / 동구=조선산업배후 / 중구=태화강·혁신도시(시청) / 북구=현대차공장

[기타] 단원구=안산시소속(인천아님)

[작성 규칙]
1. headline (25자 이내) — 다양한 스타일 중 하나:
   - 특징 강조: "강남 업무지구 핵심, 학군 밀도 최고"
   - 숫자 강조: "입지점수 1.34, 전국 최상위"
   - 비교: "서초 대비 0.03점 우위, 최상급지 1위"
   - 추세: "토허제 속 8주 연속 보합, 안정적 최상급"
   상투어 금지: "안정적 입지 가치 유지", "우수 입지 지속" 등

2. summary (100~160자):
   - 첫 문장 "~는 ~입니다" 패턴 금지
   - 위 데이터의 숫자를 최소 2개 포함 (예: "평당가 9,596만원", "주간 -0.06%")
   - 지역 유형별 관점을 반드시 반영
   - 투자 권유 금지 ("매수 적기" 등)
   - 모든 지역에 해당하는 일반론 금지

3. tags (2~4개):
   - 급지 1개 (필수): 최상급지/상급지/중급지/중하급지/하급지
   - 지리 1개 (필수): 서울/수도권/인천권/부산권/대구권/울산권/신도시
   - 특징 0~2개: 본문 기반 (학군/직주근접/토허제/재건축/개발초기/산업의존 등)

[출력]
JSON만 출력. 마크다운 코드펜스 금지. 다른 텍스트 금지.
{
  "headline": "...",
  "summary": "...",
  "tags": [...]
}`;
}

// ── API 호출 ──

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateInsight(
  loc: LocationScore,
): Promise<LocationInsight | null> {
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{ role: 'user', content: buildPrompt(loc) }],
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON 파싱 실패');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      id: loc.id,
      headline: parsed.headline,
      summary: parsed.summary,
      tags: parsed.tags,
      generatedAt: new Date().toISOString(),
      scoreAtGeneration: loc.score,
    };
  } catch (err) {
    console.error(`  ❌ ${loc.name} (${loc.id}) 생성 실패:`, err);
    return null;
  }
}

// ── 메인 ──

async function main() {
  const jsonPath = path.join(process.cwd(), 'data/location-scores.json');
  const outPath = path.join(process.cwd(), 'data/location-insights.json');

  const raw = await fs.readFile(jsonPath, 'utf-8');
  const all: LocationScore[] = JSON.parse(raw);

  const sampleIds = parseSample();
  const limit = parseLimit();

  let locations: LocationScore[];
  if (sampleIds) {
    locations = all.filter((l) => sampleIds.includes(l.id));
    console.log(
      `🎯 --sample 모드: ${locations.map((l) => l.name).join(', ')} (${locations.length}개)\n`,
    );
  } else if (limit) {
    locations = all.slice(0, limit);
    console.log(`⚡ --limit ${limit} 모드: 앞에서 ${limit}개만 처리\n`);
  } else {
    locations = all;
  }

  if (FORCE) {
    console.log('🔄 --force 모드: 기존 해설 무시, 전체 재생성\n');
  }

  // 기존 insights (--force가 아닐 때만 재사용)
  let existing: Record<string, LocationInsight> = {};
  if (!FORCE) {
    try {
      const existingRaw = await fs.readFile(outPath, 'utf-8');
      const existingArr: LocationInsight[] = JSON.parse(existingRaw);
      existing = Object.fromEntries(existingArr.map((i) => [i.id, i]));
    } catch {
      console.log('기존 insights 파일 없음, 전체 생성 시작\n');
    }
  }

  const results: LocationInsight[] = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const loc of locations) {
    const prev = existing[loc.id];
    const needsRegenerate =
      FORCE || !prev || prev.scoreAtGeneration !== loc.score;

    if (!needsRegenerate) {
      results.push(prev);
      skipped++;
      continue;
    }

    process.stdout.write(
      `[${generated + failed + 1}/${locations.length}] ${loc.name} (${loc.score})... `,
    );

    const insight = await generateInsight(loc);

    if (insight) {
      results.push(insight);
      generated++;
      console.log(`✅ "${insight.headline}"`);
    } else {
      failed++;
      if (prev) results.push(prev);
    }

    // Rate limit 보호
    await new Promise((r) => setTimeout(r, 200));
  }

  await fs.writeFile(outPath, JSON.stringify(results, null, 2), 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`✅ 완료 (${elapsed}초)`);
  console.log(`   신규 생성: ${generated}개`);
  console.log(`   재사용: ${skipped}개`);
  console.log(`   실패: ${failed}개`);
  console.log(`   저장: ${outPath}`);
}

main().catch(console.error);
