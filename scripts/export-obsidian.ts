import { config } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

// launchd WorkingDirectory/RC 전환을 따라가되, 이미 주입된 프로세스 환경변수는 덮어쓰지 않는다.
const envFile = process.env.NAEZIP_ENV_FILE ?? path.resolve(process.cwd(), '.env.local');
config({ path: envFile });

/**
 * 옵시디언 글창고 export (2026-08-02).
 *
 * 원천을 모두 읽고 같은 파일시스템의 stage에 완성본을 만든 뒤에만 관리 경로를
 * 교체한다. Neon/SQLite 조회나 파일 생성이 실패하면 기존 성공본은 건드리지 않는다.
 *
 *   수동 실행:  npx tsx scripts/export-obsidian.ts
 *   정기 실행:  launchd com.gomgom.obsidian-export (매일 07:00)
 */

const DEFAULT_VAULT =
  '/Users/bangjoohan/Library/Mobile Documents/com~apple~CloudDocs/Obsidian/글창고';
const DEFAULT_BOT_DB = '/Users/bangjoohan/bots/realestate-alert/realestate.db';
const SITE = 'https://www.naezipkorea.com';
const MANAGED_NAMES = ['내집 칼럼', '뉴스 아카이브', '홈.md'] as const;
const RECOVERY_MANIFEST = '.recovery-manifest.json';

export interface PostRow {
  slug: string;
  title: string;
  excerpt: string | null;
  mdx_content: string;
  status: string;
  view_count: number;
  published_at: Date | string | null;
  created_at: Date | string;
  category: string | null;
}

export interface NewsRow {
  d: string;
  category: string | null;
  title: string;
  source: string | null;
  url: string | null;
  published_at: string | null;
}

export interface ObsidianExportLoaders {
  loadPosts: () => Promise<PostRow[]>;
  loadNews: () => Promise<NewsRow[]>;
}

export interface RunObsidianExportOptions {
  vault: string;
  loaders: ObsidianExportLoaders;
  allowEmpty?: boolean;
  now?: Date;
  runId?: string;
}

function sanitizeName(s: string): string {
  return s.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function yamlEscape(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

function assertSafeVault(vault: string): string {
  const resolved = path.resolve(vault);
  if (resolved === path.parse(resolved).root) {
    throw new Error('[export-obsidian] 파일시스템 루트는 볼트로 사용할 수 없습니다.');
  }
  return resolved;
}

async function loadPostsFromNeon(databaseUrl: string | undefined): Promise<PostRow[]> {
  if (!databaseUrl) throw new Error('[export-obsidian] DATABASE_URL 미설정');
  const sql = neon(databaseUrl);
  return (await sql`
    SELECT p.slug, p.title, p.excerpt, p.mdx_content, p.status, p.view_count,
           p.published_at, p.created_at, c.name AS category
      FROM posts p LEFT JOIN categories c ON c.id = p.category_id
     ORDER BY p.published_at NULLS LAST
  `) as PostRow[];
}

async function loadNewsFromSqlite(botDb: string): Promise<NewsRow[]> {
  if (!fs.existsSync(botDb)) {
    throw new Error(`[export-obsidian] 봇 DB를 찾을 수 없습니다: ${botDb}`);
  }
  const json = execFileSync('sqlite3', ['-readonly', '-json', botDb,
    `SELECT date(fetched_at) d, category, title, source, url, published_at
       FROM news_archive ORDER BY d, category, id`,
  ], { maxBuffer: 64 * 1024 * 1024 }).toString();
  return json.trim() ? JSON.parse(json) as NewsRow[] : [];
}

function writePosts(rows: PostRow[], root: string): number {
  fs.mkdirSync(path.join(root, '내집 칼럼'), { recursive: true });
  let written = 0;
  for (const post of rows) {
    const dateValue = post.published_at ?? post.created_at;
    const date = new Date(dateValue).toISOString().slice(0, 10);
    const dir = path.join(root, '내집 칼럼', sanitizeName(post.category ?? '미분류'));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${date}-${sanitizeName(post.slug)}.md`);
    const frontmatter = [
      '---',
      `title: ${yamlEscape(post.title)}`,
      `date: ${date}`,
      `category: ${yamlEscape(post.category ?? '미분류')}`,
      `slug: ${yamlEscape(post.slug)}`,
      `url: ${SITE}/blog/${post.slug}`,
      `status: ${post.status}`,
      `views: ${post.view_count}`,
      ...(post.excerpt ? [`excerpt: ${yamlEscape(post.excerpt)}`] : []),
      'tags: [내집]',
      '---',
      '',
    ].join('\n');
    fs.writeFileSync(file, frontmatter + post.mdx_content + '\n');
    written++;
  }
  return written;
}

function writeNews(rows: NewsRow[], root: string): number {
  fs.mkdirSync(path.join(root, '뉴스 아카이브'), { recursive: true });
  const byDay = new Map<string, NewsRow[]>();
  for (const row of rows) {
    if (!byDay.has(row.d)) byDay.set(row.d, []);
    byDay.get(row.d)!.push(row);
  }

  for (const [day, list] of byDay) {
    const dir = path.join(root, '뉴스 아카이브', day.slice(0, 7));
    fs.mkdirSync(dir, { recursive: true });
    const byCategory = new Map<string, NewsRow[]>();
    for (const row of list) {
      const category = row.category ?? '기타';
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push(row);
    }
    const parts = [`---\ndate: ${day}\ntags: [뉴스아카이브]\n---\n`];
    for (const [category, items] of byCategory) {
      parts.push(`## ${category}\n`);
      for (const item of items) {
        const link = item.url
          ? `[${item.title.replace(/[[\]]/g, ' ')}](${item.url})`
          : item.title;
        parts.push(`- ${link}${item.source ? ` — ${item.source}` : ''}`);
      }
      parts.push('');
    }
    fs.writeFileSync(path.join(dir, `${day}.md`), parts.join('\n'));
  }
  return byDay.size;
}

function writeHome(root: string, posts: number, newsDays: number, now: Date): void {
  fs.writeFileSync(path.join(root, '홈.md'), [
    '---', 'tags: [홈]', '---', '',
    '# 글창고', '',
    '> 맥미니가 매일 07:00 자동 갱신 (launchd `com.gomgom.obsidian-export`)',
    `> 마지막 갱신: ${now.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`, '',
    `- **내집 칼럼** — 발행글 ${posts}편 (사이트 posts 원본, MDX 그대로)`,
    `- **뉴스 아카이브** — ${newsDays}일치 (뉴스봇 큐레이션 링크)`, '',
    '⚠️ **내집 칼럼**·**뉴스 아카이브** 폴더는 검증된 새 완성본으로 교체됩니다 —',
    '직접 쓰는 노트는 이 두 폴더 밖에 만들어 주세요.', '',
  ].join('\n'));
}

function countMarkdownFiles(root: string): number {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) count += countMarkdownFiles(child);
    else if (entry.isFile() && entry.name.endsWith('.md')) count++;
  }
  return count;
}

interface RecoveryManifest {
  version: 1;
  previousNames: Array<(typeof MANAGED_NAMES)[number]>;
}

function writeRecoveryManifest(backupRoot: string, previousNames: string[]): void {
  const manifest: RecoveryManifest = {
    version: 1,
    previousNames: previousNames as RecoveryManifest['previousNames'],
  };
  const file = path.join(backupRoot, RECOVERY_MANIFEST);
  const descriptor = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(manifest)}\n`);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function readRecoveryManifest(backupRoot: string): RecoveryManifest {
  const file = path.join(backupRoot, RECOVERY_MANIFEST);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<RecoveryManifest>;
  if (parsed.version !== 1 || !Array.isArray(parsed.previousNames)) {
    throw new Error(`[export-obsidian] 복구 manifest가 올바르지 않습니다: ${file}`);
  }
  const validNames = new Set<string>(MANAGED_NAMES);
  if (parsed.previousNames.some((name) => !validNames.has(name))) {
    throw new Error(`[export-obsidian] 복구 manifest에 관리 범위 밖 경로가 있습니다: ${file}`);
  }
  return parsed as RecoveryManifest;
}

/** 이전 실행이 SIGKILL/재부팅으로 중단됐다면 새 조회 전에 마지막 성공본을 되돌린다. */
function recoverInterruptedExports(vault: string): void {
  const backupNames = fs.readdirSync(vault)
    .filter((name) => name.startsWith('.obsidian-export-backup-'))
    .sort();
  if (backupNames.length > 1) {
    throw new Error(
      `[export-obsidian] 중단된 교체 backup이 ${backupNames.length}개입니다. 수동 확인이 필요합니다.`,
    );
  }

  for (const backupName of backupNames) {
    const backupRoot = path.join(vault, backupName);
    if (!fs.statSync(backupRoot).isDirectory()) {
      throw new Error(`[export-obsidian] 복구 backup이 디렉터리가 아닙니다: ${backupRoot}`);
    }
    const entries = fs.readdirSync(backupRoot);
    if (entries.length === 0) {
      fs.rmdirSync(backupRoot);
      continue;
    }
    if (!entries.includes(RECOVERY_MANIFEST)) {
      throw new Error(`[export-obsidian] 복구 manifest가 없어 backup을 보존합니다: ${backupRoot}`);
    }

    const manifest = readRecoveryManifest(backupRoot);
    const previousNames = new Set<string>(manifest.previousNames);
    for (const name of MANAGED_NAMES) {
      const target = path.join(vault, name);
      const backup = path.join(backupRoot, name);
      if (previousNames.has(name)) {
        if (fs.existsSync(backup)) {
          fs.rmSync(target, { recursive: true, force: true });
          fs.renameSync(backup, target);
        } else if (!fs.existsSync(target)) {
          throw new Error(`[export-obsidian] 이전 성공본을 복구할 수 없습니다: ${name}`);
        }
      } else {
        // 이전에 없던 경로라면 중단된 실행이 반쯤 발행한 신규본만 제거한다.
        fs.rmSync(target, { recursive: true, force: true });
      }
    }

    fs.rmSync(backupRoot, { recursive: true, force: true });
    const runId = backupName.slice('.obsidian-export-backup-'.length);
    fs.rmSync(path.join(vault, `.obsidian-export-stage-${runId}`), {
      recursive: true,
      force: true,
    });
    console.warn(`[export-obsidian] 중단된 교체에서 이전 성공본을 복구했습니다: ${runId}`);
  }
}

/**
 * 각 관리 경로를 같은 파일시스템의 rename으로 교체한다. 모든 이전 경로는 전체
 * 교체가 끝날 때까지 backup에 남기며, 동기 오류가 나면 역순으로 복구한다.
 */
function commitStagedExport(vault: string, stageRoot: string, runId: string): void {
  const backupRoot = path.join(vault, `.obsidian-export-backup-${runId}`);
  fs.mkdirSync(backupRoot);
  const previousNames = MANAGED_NAMES.filter((name) => fs.existsSync(path.join(vault, name)));
  writeRecoveryManifest(backupRoot, previousNames);
  const oldMoved: string[] = [];
  const newMoved: string[] = [];

  try {
    for (const name of MANAGED_NAMES) {
      const target = path.join(vault, name);
      if (!fs.existsSync(target)) continue;
      fs.renameSync(target, path.join(backupRoot, name));
      oldMoved.push(name);
    }
    for (const name of MANAGED_NAMES) {
      const staged = path.join(stageRoot, name);
      if (!fs.existsSync(staged)) {
        throw new Error(`[export-obsidian] stage 누락: ${name}`);
      }
      fs.renameSync(staged, path.join(vault, name));
      newMoved.push(name);
    }
    fs.rmSync(backupRoot, { recursive: true, force: true });
  } catch (error) {
    for (const name of [...newMoved].reverse()) {
      const target = path.join(vault, name);
      const staged = path.join(stageRoot, name);
      if (fs.existsSync(target) && !fs.existsSync(staged)) fs.renameSync(target, staged);
    }
    for (const name of [...oldMoved].reverse()) {
      const backup = path.join(backupRoot, name);
      const target = path.join(vault, name);
      if (fs.existsSync(backup) && !fs.existsSync(target)) fs.renameSync(backup, target);
    }
    const unresolved = oldMoved.filter((name) => fs.existsSync(path.join(backupRoot, name)));
    if (unresolved.length === 0) {
      fs.rmSync(backupRoot, { recursive: true, force: true });
    } else {
      console.error(
        `[export-obsidian] 자동 롤백 미완료로 backup을 보존합니다: ${unresolved.join(', ')}`,
      );
    }
    throw error;
  }
}

export async function runObsidianExport(
  options: RunObsidianExportOptions,
): Promise<{ posts: number; newsDays: number }> {
  const vault = assertSafeVault(options.vault);
  fs.mkdirSync(vault, { recursive: true });
  recoverInterruptedExports(vault);

  // 가장 중요한 순서 보장: 두 원천 조회가 모두 성공하기 전에는 볼트에 쓰지 않는다.
  const [postRows, newsRows] = await Promise.all([
    options.loaders.loadPosts(),
    options.loaders.loadNews(),
  ]);
  if (!options.allowEmpty && (postRows.length === 0 || newsRows.length === 0)) {
    throw new Error(
      `[export-obsidian] 빈 원천으로 기존 성공본을 교체하지 않습니다. posts=${postRows.length}, news=${newsRows.length}`,
    );
  }
  const runId = options.runId ?? `${Date.now()}-${process.pid}`;
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw new Error('[export-obsidian] 잘못된 runId');
  const stageRoot = path.join(vault, `.obsidian-export-stage-${runId}`);
  if (fs.existsSync(stageRoot)) throw new Error(`[export-obsidian] stage가 이미 존재합니다: ${stageRoot}`);
  fs.mkdirSync(stageRoot);

  try {
    const posts = writePosts(postRows, stageRoot);
    const newsDays = writeNews(newsRows, stageRoot);
    writeHome(stageRoot, posts, newsDays, options.now ?? new Date());

    if (countMarkdownFiles(path.join(stageRoot, '내집 칼럼')) !== posts) {
      throw new Error('[export-obsidian] 칼럼 stage 파일 수 검증 실패');
    }
    if (countMarkdownFiles(path.join(stageRoot, '뉴스 아카이브')) !== newsDays) {
      throw new Error('[export-obsidian] 뉴스 stage 파일 수 검증 실패');
    }
    if (fs.statSync(path.join(stageRoot, '홈.md')).size === 0) {
      throw new Error('[export-obsidian] 홈 stage 검증 실패');
    }

    commitStagedExport(vault, stageRoot, runId);
    return { posts, newsDays };
  } finally {
    fs.rmSync(stageRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const vault = process.env.OBSIDIAN_VAULT ?? DEFAULT_VAULT;
  const botDb = process.env.OBSIDIAN_BOT_DB ?? DEFAULT_BOT_DB;
  const result = await runObsidianExport({
    vault,
    allowEmpty: process.env.OBSIDIAN_ALLOW_EMPTY_EXPORT === '1',
    loaders: {
      loadPosts: () => loadPostsFromNeon(process.env.DATABASE_URL),
      loadNews: () => loadNewsFromSqlite(botDb),
    },
  });
  console.log(
    `[export-obsidian] 완료 — 칼럼 ${result.posts}편 · 뉴스 ${result.newsDays}일치 → ${vault}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error('[export-obsidian] 실패:', error);
    process.exit(1);
  });
}
