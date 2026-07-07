/**
 * 파이프라인 상태 점검 — 사이클 MM (시드·봇 push·점수 반영 한눈에)
 *
 * 실행: npx tsx scripts/check-status.ts
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
  if (!url) { console.error('DATABASE_URL 미설정'); process.exit(1); }
  const sql = neon(url);

  // ① 역대 전고점 시드 (apt_highs)
  const highs = await sql`
    SELECT source, count(*)::int AS c, count(DISTINCT district)::int AS d
    FROM apt_highs GROUP BY source ORDER BY source
  `;
  console.log('① apt_highs (역대 전고점):');
  if (highs.length === 0) console.log('   ⚠️ 비어 있음 — 시드 미완료');
  for (const r of highs) {
    console.log(`   ${r.source === 'seed' ? '시드' : '봇  '}: ${Number(r.c).toLocaleString()}행 · ${r.d}개 구`);
  }
  const seedDistricts = highs.find((r) => r.source === 'seed');
  if (seedDistricts) {
    console.log(`   → 시드 ${Number(seedDistricts.d) >= 75 ? '✅ 완료 (75개 구 전체)' : `⚠️ 부분 완료 (${seedDistricts.d}/75개 구 — seed-apt-highs.ts --execute 로 재개)`}`);
  }

  // ② 봇 일일 push (daily_stats 최신)
  const daily = await sql`
    SELECT date, total_count, total_new_highs, updated_at
    FROM daily_stats ORDER BY date DESC LIMIT 3
  `;
  console.log('\n② daily_stats (봇 오늘 공개분):');
  if (daily.length === 0) console.log('   ⚠️ 비어 있음 — 봇 push 기록 없음');
  for (const r of daily) {
    console.log(`   ${r.date}: 총 ${r.total_count}건 · 신고가 ${r.total_new_highs}건`);
  }

  // ③ 봇 apt-highs push (bot source 최근 갱신)
  const botHigh = await sql`
    SELECT count(*)::int AS c, max(updated_at) AS latest
    FROM apt_highs WHERE source = 'bot'
  `;
  console.log('\n③ 봇 신고가 push:');
  console.log(botHigh[0].c > 0
    ? `   ✅ ${Number(botHigh[0].c).toLocaleString()}행 · 최근 ${botHigh[0].latest}`
    : '   ⚠️ 아직 없음 (시드보다 낮은 가격은 갱신 안 함 — 정상일 수 있음)');

  // ④ 입지 점수
  const scores = await sql`
    SELECT count(*)::int AS total, count(master_id)::int AS matched,
           count(*) FILTER (WHERE is_region_top)::int AS tops
    FROM apt_scores
  `;
  console.log('\n④ apt_scores (입지 점수):');
  console.log(`   ${scores[0].total}건 · 마스터 연결 ${scores[0].matched}건 · 대장 ${scores[0].tops}곳`);
}

main();
