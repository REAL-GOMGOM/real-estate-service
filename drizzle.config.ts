import dotenv from 'dotenv';
import path from 'path';
import { defineConfig } from 'drizzle-kit';

// .env.local 우선, .env 폴백
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (!process.env.DATABASE_URL_UNPOOLED) {
  throw new Error('DATABASE_URL_UNPOOLED 환경변수 미설정');
}

export default defineConfig({
  // 마이그레이션은 unpooled URL 사용 (트랜잭션·prepared statement 안전)
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED,
  },
  // SQL 마이그레이션 파일 검토 친화적 포맷
  verbose: true,
  strict: true,
});
