import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';

/**
 * 노량진4구역 글 용적률 차트 데이터 교정 (임시 스크립트).
 *
 * 문제: LLM이 차트에 placeholder(100/100)를 넣음 — 본문 표의 정답은 248.25% → 273.65%.
 * 교체: 정확한 값 + autoScale + 서사에 맞는 색(전 gray, 후 red).
 *
 * 실행:
 *   npx tsx scripts/fix-noryangjin-chart.ts            # dry-run
 *   npx tsx scripts/fix-noryangjin-chart.ts --execute  # 적용
 */
const SLUG = 'noryangjin-4-district-redevelopment-plan-change-approval-2026';

const OLD_BLOCK =
  '<HorizontalBarChart title="용적률·건폐율 변경 전후 비교 (%)" unit="%" data={[{ label: "용적률 변경 전", value: 100 }, { label: "용적률 변경 후", value: 100 }]} />';

const NEW_BLOCK =
  '<HorizontalBarChart title="용적률 변경 전후 비교 (%)" unit="%" autoScale data={[{ label: "변경 전", value: 248.25, color: "gray" }, { label: "변경 후", value: 273.65, color: "red" }]} />';

async function main() {
  const execute = process.argv.includes('--execute');
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('[fix] DATABASE_URL_UNPOOLED 미설정');
    process.exit(1);
  }
  const sql = neon(url);

  const rows = (await sql`
    SELECT id, slug, mdx_content FROM posts WHERE slug = ${SLUG} LIMIT 1
  `) as Array<{ id: string; slug: string; mdx_content: string }>;

  if (rows.length === 0) {
    console.error(`[fix] 글 없음: ${SLUG}`);
    process.exit(1);
  }
  const post = rows[0];
  const count = post.mdx_content.split(OLD_BLOCK).length - 1;
  console.log(`[fix] 대상: ${post.slug} | 매칭 블록: ${count}건`);

  if (count !== 1) {
    console.error('[fix] 매칭이 정확히 1건이 아님 — 중단 (이미 교체됐거나 원문 변경됨)');
    process.exit(1);
  }

  console.log('\n--- 교체 전 ---\n' + OLD_BLOCK);
  console.log('\n--- 교체 후 ---\n' + NEW_BLOCK);

  if (!execute) {
    console.log('\n[fix] dry-run 종료 — 적용은 --execute');
    return;
  }

  const next = post.mdx_content.replace(OLD_BLOCK, NEW_BLOCK);
  await sql`UPDATE posts SET mdx_content = ${next} WHERE id = ${post.id}`;

  const verify = (await sql`
    SELECT mdx_content LIKE ${'%' + NEW_BLOCK + '%'} AS applied FROM posts WHERE id = ${post.id}
  `) as Array<{ applied: boolean }>;
  console.log(`\n[fix] 적용 완료 · 검증: ${verify[0]?.applied ? 'OK' : '실패'}`);
}

main().catch((e) => {
  console.error('[fix] 실패:', e);
  process.exit(1);
});
