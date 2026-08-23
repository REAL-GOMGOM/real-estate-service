import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';

/**
 * 노량진4구역 글의 용적률 차트 블록 + 본문 수치 진단 (읽기 전용, 임시 스크립트).
 * 실행: npx tsx scripts/inspect-noryangjin-chart.ts
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('[inspect] DATABASE_URL_UNPOOLED 미설정');
    process.exit(1);
  }
  const sql = neon(url);

  const rows = (await sql`
    SELECT slug, title, mdx_content
    FROM posts
    WHERE title LIKE '%노량진%'
    ORDER BY created_at DESC
    LIMIT 3
  `) as Array<{ slug: string; title: string; mdx_content: string }>;

  for (const p of rows) {
    console.log(`\n===== [${p.slug}] ${p.title} =====`);
    const mdx = p.mdx_content;

    let idx = mdx.indexOf('HorizontalBarChart');
    let n = 0;
    while (idx !== -1 && n < 5) {
      console.log(`\n--- HorizontalBarChart 블록 #${n + 1} ---`);
      console.log(mdx.slice(Math.max(0, idx - 80), idx + 700));
      idx = mdx.indexOf('HorizontalBarChart', idx + 1);
      n += 1;
    }
    if (n === 0) console.log('(HorizontalBarChart 없음)');

    const j = mdx.indexOf('용적률');
    if (j !== -1) {
      console.log('\n--- 본문의 용적률 서술 (수치 대조용) ---');
      console.log(mdx.slice(Math.max(0, j - 80), j + 500));
    }
  }
}

main().catch((e) => {
  console.error('[inspect] 실패:', e);
  process.exit(1);
});
