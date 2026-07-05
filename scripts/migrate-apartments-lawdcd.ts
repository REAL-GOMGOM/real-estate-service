/**
 * apartments 마스터 lawd_cd 마이그레이션 — 2026 행정구역 개편 (사이클 Z5)
 *
 * 대상: 1:1 치환 가능한 코드만 (광주 5·전남 22·전북 15 = 42개).
 * 부천(41190)·화성(41590)은 법정동→신설구 매핑이 필요해 2차로 분리 —
 * 본 스크립트는 해당 잔여 건수만 리포트한다.
 *
 * 실행:
 *   npx tsx scripts/migrate-apartments-lawdcd.ts            (dry-run)
 *   npx tsx scripts/migrate-apartments-lawdcd.ts --execute  (실제 반영)
 */
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

// .env.local 로드
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

// 구코드 → 신코드 (1:1 확정분 — MOLIT 실측 검증 완료)
const CODE_MIGRATION: Record<string, string> = {
  // 광주 (전남광주통합특별시)
  '29110': '12210', '29140': '12240', '29155': '12270',
  '29170': '12300', '29200': '12330',
  // 전남
  '46110': '12110', '46130': '12130', '46150': '12150',
  '46170': '12170', '46230': '12190',
  '46710': '12710', '46720': '12720', '46730': '12730',
  '46770': '12740', '46780': '12750', '46790': '12760',
  '46800': '12770', '46810': '12780', '46820': '12790',
  '46830': '12800', '46840': '12810', '46860': '12820',
  '46870': '12830', '46880': '12840', '46890': '12850',
  '46900': '12860', '46910': '12870',
  // 전북 (전북특별자치도)
  '45111': '52111', '45113': '52113',
  '45130': '52130', '45140': '52140', '45180': '52180',
  '45190': '52190', '45210': '52210',
  '45710': '52710', '45720': '52720', '45730': '52730',
  '45740': '52740', '45750': '52750', '45770': '52770',
  '45790': '52790', '45800': '52800',
};

// 2차 대상 (법정동→신설구 매핑 필요 — 리포트만)
const PENDING_CODES = ['41190', '41590'];

async function main() {
  const execute = process.argv.includes('--execute');
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL_UNPOOLED 미설정 (.env.local)');
    process.exit(1);
  }
  const sql = neon(url);

  console.log(`apartments lawd_cd 마이그레이션 — ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);

  let totalTargets = 0;
  for (const [oldCode, newCode] of Object.entries(CODE_MIGRATION)) {
    const rows = await sql`
      SELECT count(*)::int AS cnt FROM apartments WHERE lawd_cd = ${oldCode}
    `;
    const cnt = rows[0].cnt as number;
    if (cnt === 0) continue;
    totalTargets += cnt;

    if (execute) {
      await sql`
        UPDATE apartments SET lawd_cd = ${newCode} WHERE lawd_cd = ${oldCode}
      `;
      console.log(`  ${oldCode} → ${newCode}: ${cnt}건 UPDATE 완료`);
    } else {
      console.log(`  ${oldCode} → ${newCode}: ${cnt}건 (dry-run)`);
    }
  }

  console.log(`\n1:1 치환 대상 합계: ${totalTargets}건 ${execute ? '— 반영 완료' : ''}`);

  // 2차 대상 리포트
  for (const code of PENDING_CODES) {
    const rows = await sql`
      SELECT count(*)::int AS cnt FROM apartments WHERE lawd_cd = ${code}
    `;
    const label = code === '41190' ? '부천시(3구 분리 필요)' : '화성시(4구 분리 필요)';
    console.log(`2차 대기 — ${label}: ${rows[0].cnt}건 (법정동 매핑 후 별도 처리)`);
  }

  if (!execute) {
    console.log('\n반영하려면: npx tsx scripts/migrate-apartments-lawdcd.ts --execute');
  }
}

main();
