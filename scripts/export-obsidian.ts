import { config } from 'dotenv';
config({ path: '/Users/bangjoohan/real-estate-service/.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { neon } from '@neondatabase/serverless';

/**
 * 옵시디언 글창고 export (2026-08-02).
 *
 * 발행한 모든 글을 맥미니 옵시디언 볼트(마크다운 폴더)로 아카이브:
 *   - 내집 칼럼: Neon posts + categories → 카테고리 폴더/날짜-슬러그.md
 *     (frontmatter: title·date·category·url·views — MDX 본문 그대로)
 *   - 뉴스 아카이브: 봇 realestate.db news_archive → 일별 다이제스트 노트
 * 멱등 전체 재작성 — 수정·조회수 갱신도 다음 실행에 반영.
 *
 *   수동 실행:  npx tsx scripts/export-obsidian.ts
 *   정기 실행:  launchd com.gomgom.obsidian-export (매일 07:00)
 */

// iCloud Drive 볼트 — 맥북 옵시디언과 자동 동기화 (2026-08-02 이동)
const VAULT = process.env.OBSIDIAN_VAULT
  ?? '/Users/bangjoohan/Library/Mobile Documents/com~apple~CloudDocs/Obsidian/글창고';
const SITE = 'https://www.naezipkorea.com';
const BOT_DB = '/Users/bangjoohan/bots/realestate-alert/realestate.db';

function sanitizeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function yamlEscape(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

async function exportPosts(): Promise<number> {
  // 자동 관리 폴더 — 카테고리 이동·슬러그 변경 시 옛 파일이 남지 않게 전체 재생성.
  // 사용자 자체 노트는 이 폴더 밖에 둘 것 (홈.md 에 안내).
  fs.rmSync(path.join(VAULT, '내집 칼럼'), { recursive: true, force: true });
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT p.slug, p.title, p.excerpt, p.mdx_content, p.status, p.view_count,
           p.published_at, p.created_at, c.name AS category
      FROM posts p LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.published_at NULLS LAST
  `) as Array<{
    slug: string; title: string; excerpt: string | null; mdx_content: string;
    status: string; view_count: number; published_at: Date | null; created_at: Date;
    category: string | null;
  }>;

  let written = 0;
  for (const p of rows) {
    const date = (p.published_at ?? p.created_at).toISOString().slice(0, 10);
    const dir = path.join(VAULT, '내집 칼럼', sanitizeName(p.category ?? '미분류'));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${date}-${sanitizeName(p.slug)}.md`);
    const fm = [
      '---',
      `title: ${yamlEscape(p.title)}`,
      `date: ${date}`,
      `category: ${p.category ?? '미분류'}`,
      `slug: ${p.slug}`,
      `url: ${SITE}/blog/${p.slug}`,
      `status: ${p.status}`,
      `views: ${p.view_count}`,
      ...(p.excerpt ? [`excerpt: ${yamlEscape(p.excerpt)}`] : []),
      'tags: [내집]',
      '---',
      '',
    ].join('\n');
    fs.writeFileSync(file, fm + p.mdx_content + '\n');
    written++;
  }
  return written;
}

interface NewsRow { d: string; category: string | null; title: string; source: string | null; url: string | null; published_at: string | null }

function exportNews(): number {
  if (!fs.existsSync(BOT_DB)) {
    console.warn('[export-obsidian] 봇 DB 없음 — 뉴스 아카이브 스킵:', BOT_DB);
    return 0;
  }
  fs.rmSync(path.join(VAULT, '뉴스 아카이브'), { recursive: true, force: true });
  const json = execFileSync('sqlite3', ['-json', BOT_DB,
    `SELECT date(fetched_at) d, category, title, source, url, published_at
       FROM news_archive ORDER BY d, category, id`,
  ], { maxBuffer: 64 * 1024 * 1024 }).toString();
  const rows: NewsRow[] = json.trim() ? JSON.parse(json) : [];

  const byDay = new Map<string, NewsRow[]>();
  for (const r of rows) {
    if (!byDay.has(r.d)) byDay.set(r.d, []);
    byDay.get(r.d)!.push(r);
  }

  for (const [day, list] of byDay) {
    const dir = path.join(VAULT, '뉴스 아카이브', day.slice(0, 7));
    fs.mkdirSync(dir, { recursive: true });
    const byCat = new Map<string, NewsRow[]>();
    for (const r of list) {
      const cat = r.category ?? '기타';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(r);
    }
    const parts = [`---\ndate: ${day}\ntags: [뉴스아카이브]\n---\n`];
    for (const [cat, items] of byCat) {
      parts.push(`## ${cat}\n`);
      for (const it of items) {
        const link = it.url ? `[${it.title.replace(/[[\]]/g, ' ')}](${it.url})` : it.title;
        parts.push(`- ${link}${it.source ? ` — ${it.source}` : ''}`);
      }
      parts.push('');
    }
    fs.writeFileSync(path.join(dir, `${day}.md`), parts.join('\n'));
  }
  return byDay.size;
}

async function main() {
  fs.mkdirSync(VAULT, { recursive: true });
  const posts = await exportPosts();
  const newsDays = exportNews();

  const home = path.join(VAULT, '홈.md');
  fs.writeFileSync(home, [
    '---', 'tags: [홈]', '---', '',
    '# 글창고', '',
    `> 맥미니가 매일 07:00 자동 갱신 (launchd \`com.gomgom.obsidian-export\`)`,
    `> 마지막 갱신: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`, '',
    `- **내집 칼럼** — 발행글 ${posts}편 (사이트 posts 원본, MDX 그대로)`,
    `- **뉴스 아카이브** — ${newsDays}일치 (뉴스봇 큐레이션 링크)`, '',
    '⚠️ **내집 칼럼**·**뉴스 아카이브** 폴더는 매일 전체 재생성됩니다 —',
    '직접 쓰는 노트는 이 두 폴더 밖에 만들어 주세요.', '',
  ].join('\n'));

  console.log(`[export-obsidian] 완료 — 칼럼 ${posts}편 · 뉴스 ${newsDays}일치 → ${VAULT}`);
}

main().catch((e) => { console.error('[export-obsidian] 실패:', e); process.exit(1); });
