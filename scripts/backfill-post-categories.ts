import { config } from 'dotenv';
config({ path: '.env.local' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, isNull } from 'drizzle-orm';
import { posts, categories } from '../lib/db/schema';

/**
 * 기존 글 카테고리 백필 — 일회성 (2026-07-12).
 *
 * category_id 가 NULL 인 글 전부를 키워드 규칙으로 분류해 채운다.
 * 규칙은 봇의 scripts/lib/column_category.py 와 동일해야 한다 (상호 참조 주석).
 * 봇 쪽 규칙을 바꾸면 이 스크립트는 폐기됐으므로 무시해도 됨 — 재실행 금지 대상.
 *
 * 실행 (맥):
 *   npx tsx scripts/backfill-post-categories.ts          # dry-run (변경 없음)
 *   npx tsx scripts/backfill-post-categories.ts --apply  # 실제 반영
 *
 * 전제: categories 테이블 시드 완료 (npm run db:seed)
 */

// ── 분류 규칙: 봇 scripts/lib/column_category.py 와 1:1 동일 ──
const RULES: Array<[slug: string, keywords: string[]]> = [
  ['subscription', ['청약', '분양가', '분양', '당첨', '가점', '특별공급', '사전청약', '입주자모집']],
  ['tax', ['양도세', '취득세', '종부세', '종합부동산세', '보유세', '증여세', '상속세', '재산세', '세율', '비과세', '세금']],
  ['loan', ['대출', '금리', '주담대', '디딤돌', '보금자리론', '전세자금', 'DSR', 'LTV', 'DTI', '코픽스']],
  ['policy', ['정책', '규제', '토허제', '토지거래허가', '투기과열', '조정대상', '공급대책', '대책', '법안', '국토부', '행정체제']],
];
const DEFAULT_SLUG = 'market-trends';
const BODY_HEAD_CHARS = 600; // 뒤쪽 각주·백링크의 우발적 키워드 오염 방지

function classify(title: string, mdx: string): string {
  const bodyHead = (mdx ?? '').slice(0, BODY_HEAD_CHARS);
  // 1차: 제목 (제목이 글의 주제를 대표)
  for (const [slug, keywords] of RULES) {
    if (keywords.some((k) => title.includes(k))) return slug;
  }
  // 2차: 본문 앞부분
  for (const [slug, keywords] of RULES) {
    if (keywords.some((k) => bodyHead.includes(k))) return slug;
  }
  return DEFAULT_SLUG;
}

async function main() {
  const apply = process.argv.includes('--apply');

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 이 없습니다 (.env.local 확인)');
    process.exit(1);
  }
  const db = drizzle(neon(url));

  // 카테고리 slug → id 매핑
  const cats = await db.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories);
  if (cats.length === 0) {
    console.error('categories 테이블이 비어 있습니다 — 먼저 npm run db:seed 를 실행하세요.');
    process.exit(1);
  }
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const missing = [DEFAULT_SLUG, ...RULES.map(([s]) => s)].filter((s) => !bySlug.has(s));
  if (missing.length > 0) {
    console.error(`시드에 없는 slug: ${missing.join(', ')} — seed-categories.ts 확인 필요`);
    process.exit(1);
  }

  // 대상: category_id 미지정 글 전부 (draft 포함 — 상태 무관하게 분류는 유효)
  const rows = await db
    .select({ id: posts.id, title: posts.title, mdxContent: posts.mdxContent })
    .from(posts)
    .where(isNull(posts.categoryId));

  console.log(`대상: ${rows.length}건 (category_id IS NULL)\n`);

  const counts = new Map<string, number>();
  for (const row of rows) {
    const slug = classify(row.title, row.mdxContent ?? '');
    const cat = bySlug.get(slug)!;
    counts.set(cat.name, (counts.get(cat.name) ?? 0) + 1);
    console.log(`  [${cat.name}] ${row.title.slice(0, 48)}`);

    if (apply) {
      await db.update(posts).set({ categoryId: cat.id }).where(eq(posts.id, row.id));
    }
  }

  console.log(`\n분포: ${[...counts.entries()].map(([n, c]) => `${n} ${c}건`).join(' · ')}`);
  console.log(apply ? '\n✅ 반영 완료' : '\n(dry-run — 반영하려면 --apply)');
}

main().catch((e) => {
  console.error('실패:', e instanceof Error ? e.message : e);
  process.exit(1);
});
