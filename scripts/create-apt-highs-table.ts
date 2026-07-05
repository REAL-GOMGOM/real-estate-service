/**
 * apt_highs 테이블 단독 생성 — 사이클 FF (역대 전고점)
 *
 * drizzle-kit push 가 무관한 기존 테이블 DROP 을 끼워 제안하므로
 * 이 테이블만 안전하게 생성하는 원샷 스크립트. 멱등 (IF NOT EXISTS).
 *
 * 실행: npx tsx scripts/create-apt-highs-table.ts
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
    CREATE TABLE IF NOT EXISTS "apt_highs" (
      "id" text PRIMARY KEY NOT NULL,
      "district" text NOT NULL,
      "apt_name" text NOT NULL,
      "area" integer NOT NULL,
      "price" integer NOT NULL,
      "deal_date" text NOT NULL,
      "source" text NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS "apt_highs_district_name_idx"
    ON "apt_highs" ("district", "apt_name")
  `;

  const check = await sql`
    SELECT count(*)::int AS cnt FROM information_schema.tables
    WHERE table_name = 'apt_highs'
  `;
  console.log(check[0].cnt === 1 ? '✅ apt_highs 테이블 준비 완료' : '❌ 생성 확인 실패');
}

main();
