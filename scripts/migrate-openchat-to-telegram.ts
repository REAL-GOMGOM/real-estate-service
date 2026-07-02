import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, like } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { posts } from '../lib/db/schema';

/**
 * 기존 발행 글 본문(mdxContent)의 오픈카톡 푸터 → 텔레그램 채널 푸터 일괄 교체.
 *
 * 안전장치:
 * - 기본 dry-run: 대상 글과 교체 전/후 snippet만 출력, DB 무변경.
 * - `--execute` 플래그일 때만 실행하며, 실행 전 대상 원문 전체를 JSON 백업.
 * - 알 수 없는 open.kakao.com URL(지정 URL 외)이 남는 글은 자동 교체하지 않고
 *   수동 검토 대상으로 보고만 한다.
 * - 멱등성: 재실행 시 대상 0건이어야 정상.
 *
 * 실행:
 *   npx tsx scripts/migrate-openchat-to-telegram.ts            # dry-run
 *   npx tsx scripts/migrate-openchat-to-telegram.ts --execute  # 실제 교체
 */

const OLD_URL = 'https://open.kakao.com/o/gJO6RLsi';
const NEW_URL = 'https://t.me/realMyzip';

// 순서 중요: 문장 전체 → 라벨 잔여 변형 → URL
const TEXT_REPLACEMENTS: Array<[string, string]> = [
  [
    '💬 부동산 궁금증은 오픈채팅방에서 함께 나눠요 → [내집 오픈채팅 바로가기]',
    '📢 실거래 신고가·시장 분석 소식을 가장 빠르게 → [내집 텔레그램 채널 바로가기]',
  ],
  ['[내집 오픈채팅 바로가기]', '[내집 텔레그램 채널 바로가기]'],
  [OLD_URL, NEW_URL],
];

const SNIPPET_RADIUS = 80;

function snippetAround(text: string, needle: string): string {
  const idx = text.indexOf(needle);
  if (idx === -1) return '(매치 없음)';
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(text.length, idx + needle.length + SNIPPET_RADIUS);
  return `…${text.slice(start, end).replace(/\n/g, '⏎')}…`;
}

function applyReplacements(content: string): { next: string; count: number } {
  let next = content;
  let count = 0;
  for (const [from, to] of TEXT_REPLACEMENTS) {
    const parts = next.split(from);
    if (parts.length > 1) {
      count += parts.length - 1;
      next = parts.join(to);
    }
  }
  return { next, count };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error('[migrate] DATABASE_URL_UNPOOLED 미설정');
    process.exit(1);
  }

  const db = drizzle(neon(url));

  const targets = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      status: posts.status,
      mdxContent: posts.mdxContent,
    })
    .from(posts)
    .where(like(posts.mdxContent, '%open.kakao.com%'));

  console.log(`[migrate] 대상: ${targets.length}건 (mdxContent에 open.kakao.com 포함)`);
  if (targets.length === 0) {
    console.log('[migrate] 교체할 글 없음 — 종료 (멱등 상태 정상)');
    return;
  }

  const updatable: Array<{ id: string; slug: string; next: string; count: number }> = [];
  const manual: Array<{ id: string; slug: string }> = [];

  for (const post of targets) {
    const { next, count } = applyReplacements(post.mdxContent);
    const leftover = next.includes('open.kakao.com');

    console.log(`\n— [${post.status}] ${post.slug} (${post.title})`);
    console.log(`  교체 ${count}건`);
    console.log(`  전: ${snippetAround(post.mdxContent, 'open.kakao.com')}`);
    console.log(`  후: ${snippetAround(next, NEW_URL)}`);

    if (leftover) {
      console.log('  ⚠️ 지정 URL 외 open.kakao.com 잔존 → 자동 교체 제외, 수동 검토 필요');
      console.log(`  잔존: ${snippetAround(next, 'open.kakao.com')}`);
      manual.push({ id: post.id, slug: post.slug });
    } else {
      updatable.push({ id: post.id, slug: post.slug, next, count });
    }
  }

  console.log(`\n[migrate] 자동 교체 가능 ${updatable.length}건 / 수동 검토 ${manual.length}건`);

  if (!execute) {
    console.log('[migrate] dry-run 종료 — 실제 교체는 --execute 플래그로 실행');
    return;
  }

  // 백업: 대상 전체 원문 (수동 검토 대상 포함)
  const backupDir = path.join('scripts', 'backup');
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const backupPath = path.join(backupDir, `openchat-migration-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      targets.map((p) => ({ id: p.id, slug: p.slug, mdxContent: p.mdxContent })),
      null,
      2,
    ),
    'utf-8',
  );
  console.log(`[migrate] 백업 완료: ${backupPath} (${targets.length}건 원문)`);

  let updated = 0;
  for (const u of updatable) {
    await db.update(posts).set({ mdxContent: u.next }).where(eq(posts.id, u.id));
    updated += 1;
    console.log(`  ✓ ${u.slug} 교체 완료 (${u.count}건 치환)`);
  }

  const remaining = await db
    .select({ id: posts.id })
    .from(posts)
    .where(like(posts.mdxContent, '%open.kakao.com%'));

  console.log(`\n[migrate] 완료: ${updated}건 교체, 잔존 ${remaining.length}건`);
  if (remaining.length > 0) {
    console.log('[migrate] 잔존분은 수동 검토 대상(위 ⚠️ 목록)입니다.');
  }
}

main().catch((e) => {
  console.error('[migrate] 실패:', e);
  process.exit(1);
});
