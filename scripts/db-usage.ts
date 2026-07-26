/**
 * Neon DB 사용량·쓰기 가능 여부 진단
 *
 * 실행: npx tsx scripts/db-usage.ts
 * 용도: 무료 512MB 한도 근접/초과 시 insert 500 (봇 draft 실패 등) 원인 확인
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL 미설정 (.env.local 확인)');
  const sql = neon(url);

  // 1) 전체 DB 크기
  const sizeRows = (await sql`
    SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) AS mb
  `) as Array<{ mb: string }>;
  console.log(`[db] 전체 크기: ${sizeRows[0].mb} MB (무료 한도 512MB)`);

  // 2) 테이블별 크기 상위 8개
  const tables = (await sql`
    SELECT relname AS table,
           round(pg_total_relation_size(c.oid) / 1024.0 / 1024.0, 1) AS mb
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC
     LIMIT 8
  `) as Array<{ table: string; mb: string }>;
  for (const t of tables) console.log(`  - ${t.table}: ${t.mb} MB`);

  // 3) 원장 행수
  const counts = (await sql`
    SELECT (SELECT COUNT(*) FROM transactions)      AS tx,
           (SELECT COUNT(*) FROM rent_transactions) AS rtx,
           (SELECT COUNT(*) FROM posts)             AS posts
  `) as Array<{ tx: string; rtx: string; posts: string }>;
  console.log(`[db] 행수 — 매매 ${counts[0].tx} / 전월세 ${counts[0].rtx} / posts ${counts[0].posts}`);

  // 4) 쓰기 프로브 — 한도 초과 시 여기서 명확한 에러가 나온다
  try {
    await sql`CREATE TABLE IF NOT EXISTS _write_probe (id int)`;
    await sql`INSERT INTO _write_probe VALUES (1)`;
    await sql`DROP TABLE _write_probe`;
    console.log('[db] 쓰기 테스트: OK — insert 500의 원인은 용량이 아님');
  } catch (e) {
    console.error('[db] 쓰기 테스트 실패 (봇 draft 500의 원인일 가능성 높음):');
    console.error('   ', e instanceof Error ? e.message : e);
  }
}

main().catch((err) => {
  console.error('[db-usage] 실패:', err);
  process.exit(1);
});
