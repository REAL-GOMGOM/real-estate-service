/**
 * daily_stats 테이블 단독 생성 — 사이클 AA
 *
 * drizzle-kit push 가 무관한 기존 테이블(백업 등) DROP 을 끼워 제안해서
 * 이 테이블만 안전하게 생성하는 원샷 스크립트. 멱등 (IF NOT EXISTS).
 *
 * 실행: npx tsx scripts/create-daily-stats-table.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL_UNPOOLED 미설정');
    process.exit(1);
  }
  const sql = neon(url);

  await sql`
    CREATE TABLE IF NOT EXISTS "daily_stats" (
      "date" text PRIMARY KEY NOT NULL,
      "regions" jsonb NOT NULL,
      "total_count" integer NOT NULL,
      "total_new_highs" integer NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;

  const check = await sql`
    SELECT count(*)::int AS cnt FROM information_schema.tables
    WHERE table_name = 'daily_stats'
  `;
  console.log(check[0].cnt === 1 ? '✅ daily_stats 테이블 준비 완료' : '❌ 생성 확인 실패');
}

main();
