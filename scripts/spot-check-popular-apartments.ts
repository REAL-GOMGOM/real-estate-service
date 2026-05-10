import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { ilike } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'node:fs';
import { apartments } from '../lib/db/schema';

/**
 * 사이클 I 진단 — 인기 단지 30건의 DB 적중 + skipped 매핑 검증.
 * 읽기 전용. apartments 테이블 INSERT/UPDATE 없음.
 */

const SKIPPED_LIST_PATH = 'data/skipped-list.json';
const OUTPUT_PATH       = 'data/spot-check-results.json';

const POPULAR_APT_NAMES = [
  // 강남 3구 대장 (5)
  '잠실엘스', '헬리오시티', '은마아파트', '잠실주공5단지', '압구정현대',
  // 한강뷰 (5)
  '아크로리버파크', '반포자이', '래미안퍼스티지', '아크로비스타', '래미안첼리투스',
  // 신축 대단지 (5)
  '디에이치자이개포', '래미안원베일리', '개포주공1단지', '래미안블레스티지', '서초그랑자이',
  // 재건축 이슈 (3)
  '대치우성1차', '도곡렉슬', '목동신시가지7단지',
  // 경기 인기 (5)
  '분당파크뷰', '광교중앙푸르지오', '판교푸르지오월드마크', '동탄2신도시반도유보라', '위례신도시',
  // 인천·부천 (2)
  '송도더샵퍼스트파크', '부천중동위브더스테이트',
  // 지방 핵심 (5)
  '해운대두산위브더제니스', '대구수성아이파크', '광주봉선롯데캐슬', '대전둔산크로바', '부산용호더블유',
];

type Status = 'ok' | 'multi_match' | 'missing_in_db_present_in_kapt' | 'missing_in_kapt';

function classifyStatus(dbHits: number, kaptSkippedHits: number): Status {
  if (dbHits === 1) return 'ok';
  if (dbHits > 1) return 'multi_match';
  // dbHits === 0
  if (kaptSkippedHits > 0) return 'missing_in_db_present_in_kapt';
  return 'missing_in_kapt';
}

/**
 * 단지명 비교용 정규화 — 공백 제거. 한자 띄어쓰기 변형 흡수.
 * MLTM/K-apt 등록명은 띄어쓰기·표기 변형 잦음.
 */
function norm(s: string): string {
  return s.replace(/\s+/g, '');
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('[spot-check] DATABASE_URL 미설정');
    process.exit(1);
  }
  const db = drizzle(neon(url));

  // skipped 리스트 로드 (refetch-kapt-list.ts 산출물)
  let skippedList: Array<{ kaptCode: string; name: string; sido: string; sigungu: string; dong: string }> = [];
  try {
    const skipped = JSON.parse(readFileSync(SKIPPED_LIST_PATH, 'utf8'));
    skippedList = skipped.skipped ?? [];
  } catch {
    console.warn(`[spot-check] ${SKIPPED_LIST_PATH} 없음 — kapt 검사 생략`);
  }

  const results = [];
  for (const target of POPULAR_APT_NAMES) {
    const dbHits = await db
      .select({
        id:      apartments.id,
        name:    apartments.name,
        sido:    apartments.sido,
        sigungu: apartments.sigungu,
        lawdCd:  apartments.lawdCd,
      })
      .from(apartments)
      .where(ilike(apartments.name, `%${target}%`))
      .limit(20);

    const targetN = norm(target);
    const kaptHits = skippedList.filter((s) => norm(s.name).includes(targetN));

    const status = classifyStatus(dbHits.length, kaptHits.length);

    results.push({
      target,
      dbHitCount:    dbHits.length,
      dbHits:        dbHits.map((m) => ({ id: m.id, name: m.name, sigungu: m.sigungu, lawdCd: m.lawdCd })),
      skippedHits:   kaptHits.map((k) => ({ kaptCode: k.kaptCode, name: k.name, sigungu: k.sigungu })),
      status,
    });
  }

  const summary: Record<Status, number> = {
    ok: 0, multi_match: 0, missing_in_db_present_in_kapt: 0, missing_in_kapt: 0,
  };
  for (const r of results) summary[r.status]++;

  const out = {
    checkedAt:    new Date().toISOString(),
    totalChecked: results.length,
    summary,
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2));
  console.log('Spot check 결과:', summary);
  console.log(`산출물: ${OUTPUT_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[spot-check] 실패:', err);
    process.exit(1);
  });
