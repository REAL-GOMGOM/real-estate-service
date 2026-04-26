import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * 칼럼(블로그) 시스템 전용 Postgres 클라이언트.
 *
 * - 런타임은 풀링된 DATABASE_URL 사용 (Edge·Serverless 환경 최적)
 * - 마이그레이션은 drizzle.config.ts가 별도로 DATABASE_URL_UNPOOLED 사용
 * - 모든 칼럼 관련 DB 접근은 이 db 인스턴스를 통해서만.
 */

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('[BlogDB] DATABASE_URL 환경변수 미설정');
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

export function getBlogDb() {
  if (!_db) _db = createDb();
  return _db;
}
