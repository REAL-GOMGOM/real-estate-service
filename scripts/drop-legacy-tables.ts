/**
 * 레거시 테이블 정리 — 사이클 HH (Eric 승인)
 *
 * 대상:
 *   - apartments_backup_cycle_j : 사이클 J 마이그레이션 전 백업 (21,931건).
 *     신코드 마이그레이션(1,751건)이 검증·배포 완료되어 보존 목적 소멸.
 *   - playing_with_neon         : Neon 가입 시 자동 생성된 샘플 테이블.
 *
 * 안전장치:
 *   - 기본 dry-run — 테이블 존재·행수만 출력, DROP 없음
 *   - --execute 시에도 본 테이블(apartments) 상태를 먼저 출력해 최종 육안 확인
 *   - DROP IF EXISTS — 이미 없으면 무해
 *
 * 실행 (Eric 터미널):
 *   npx tsx scripts/drop-legacy-tables.ts             # dry-run
 *   npx tsx scripts/drop-legacy-tables.ts --execute   # 실제 삭제
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const TARGETS = ['apartments_backup_cycle_j', 'playing_with_neon'];

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

async function main() {
  const EXECUTE = process.argv.includes('--execute');
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL_UNPOOLED 미설정'); process.exit(1); }
  const sql = neon(url);

  // 본 테이블 상태 — 백업 삭제 전 최종 확인 기준
  const main_ = await sql`SELECT count(*)::int AS c FROM apartments`;
  console.log(`본 테이블 apartments: ${main_[0].c.toLocaleString()}행 (정상 서비스 중이어야 함)\n`);

  for (const table of TARGETS) {
    const exists = await sql`
      SELECT count(*)::int AS c FROM information_schema.tables WHERE table_name = ${table}
    `;
    if (exists[0].c === 0) {
      console.log(`— ${table}: 없음 (스킵)`);
      continue;
    }
    const rows = await sql.query(`SELECT count(*)::int AS c FROM "${table}"`);
    const cnt = (rows as { c: number }[])[0].c;

    if (EXECUTE) {
      await sql.query(`DROP TABLE "${table}"`);
      console.log(`🗑️  ${table}: ${cnt.toLocaleString()}행 → DROP 완료`);
    } else {
      console.log(`🟡 ${table}: ${cnt.toLocaleString()}행 (dry-run — --execute 로 삭제)`);
    }
  }

  console.log(`\n${EXECUTE ? '완료' : 'dry-run 완료 — 삭제 없음'}`);
}

main();
