import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  runObsidianExport,
  type NewsRow,
  type PostRow,
} from '../../scripts/export-obsidian';

const tempRoots: string[] = [];

function makeVault(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'naezip-obsidian-test-'));
  tempRoots.push(root);
  const vault = path.join(root, 'vault');
  fs.mkdirSync(path.join(vault, '내집 칼럼'), { recursive: true });
  fs.mkdirSync(path.join(vault, '뉴스 아카이브'), { recursive: true });
  fs.writeFileSync(path.join(vault, '내집 칼럼', 'old.md'), 'old-column');
  fs.writeFileSync(path.join(vault, '뉴스 아카이브', 'old.md'), 'old-news');
  fs.writeFileSync(path.join(vault, '홈.md'), 'old-home');
  return vault;
}

const post: PostRow = {
  slug: 'safe-export',
  title: '안전한 내보내기',
  excerpt: '기존 성공본을 지킵니다.',
  mdx_content: '# 본문',
  status: 'published',
  view_count: 12,
  published_at: '2026-08-11T00:00:00.000Z',
  created_at: '2026-08-10T00:00:00.000Z',
  category: '운영',
};

const news: NewsRow = {
  d: '2026-08-11',
  category: '시장',
  title: '테스트 뉴스',
  source: '내집',
  url: 'https://example.com/news',
  published_at: '2026-08-11T01:00:00.000Z',
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('runObsidianExport 안전 교체', () => {
  it('SIGKILL로 남은 hidden backup을 다음 시작에서 이전 성공본으로 복구한다', async () => {
    const vault = makeVault();
    const runId = 'interrupted';
    const backupRoot = path.join(vault, `.obsidian-export-backup-${runId}`);
    const stageRoot = path.join(vault, `.obsidian-export-stage-${runId}`);
    fs.mkdirSync(backupRoot);
    fs.mkdirSync(stageRoot);
    fs.writeFileSync(path.join(backupRoot, '.recovery-manifest.json'), JSON.stringify({
      version: 1,
      previousNames: ['내집 칼럼', '뉴스 아카이브', '홈.md'],
    }));
    for (const name of ['내집 칼럼', '뉴스 아카이브', '홈.md']) {
      fs.renameSync(path.join(vault, name), path.join(backupRoot, name));
    }
    fs.mkdirSync(path.join(vault, '내집 칼럼'));
    fs.writeFileSync(path.join(vault, '내집 칼럼', 'partial-new.md'), 'partial-new');

    await expect(runObsidianExport({
      vault,
      loaders: {
        loadPosts: async () => { throw new Error('source still unavailable'); },
        loadNews: async () => [news],
      },
      runId: 'after-recovery',
    })).rejects.toThrow('source still unavailable');

    expect(fs.readFileSync(path.join(vault, '내집 칼럼', 'old.md'), 'utf8')).toBe('old-column');
    expect(fs.readFileSync(path.join(vault, '뉴스 아카이브', 'old.md'), 'utf8')).toBe('old-news');
    expect(fs.readFileSync(path.join(vault, '홈.md'), 'utf8')).toBe('old-home');
    expect(fs.existsSync(backupRoot)).toBe(false);
    expect(fs.existsSync(stageRoot)).toBe(false);
  });

  it('원천 조회가 실패하면 기존 성공본을 전혀 건드리지 않는다', async () => {
    const vault = makeVault();

    await expect(runObsidianExport({
      vault,
      loaders: {
        loadPosts: async () => { throw new Error('Neon unavailable'); },
        loadNews: async () => [news],
      },
      runId: 'query-failure',
    })).rejects.toThrow('Neon unavailable');

    expect(fs.readFileSync(path.join(vault, '내집 칼럼', 'old.md'), 'utf8')).toBe('old-column');
    expect(fs.readFileSync(path.join(vault, '뉴스 아카이브', 'old.md'), 'utf8')).toBe('old-news');
    expect(fs.readFileSync(path.join(vault, '홈.md'), 'utf8')).toBe('old-home');
    expect(fs.readdirSync(vault).some((name) => name.startsWith('.obsidian-export-'))).toBe(false);
  });

  it('빈 원천은 기본적으로 기존 성공본을 교체하지 않는다', async () => {
    const vault = makeVault();

    await expect(runObsidianExport({
      vault,
      loaders: {
        loadPosts: async () => [],
        loadNews: async () => [news],
      },
      runId: 'empty-source',
    })).rejects.toThrow('빈 원천');

    expect(fs.existsSync(path.join(vault, '내집 칼럼', 'old.md'))).toBe(true);
    expect(fs.readFileSync(path.join(vault, '홈.md'), 'utf8')).toBe('old-home');
  });

  it('두 원천과 stage 검증이 성공한 뒤에만 관리 경로를 교체한다', async () => {
    const vault = makeVault();

    const result = await runObsidianExport({
      vault,
      loaders: {
        loadPosts: async () => [post],
        loadNews: async () => [news],
      },
      now: new Date('2026-08-11T02:00:00.000Z'),
      runId: 'success',
    });

    expect(result).toEqual({ posts: 1, newsDays: 1 });
    expect(fs.existsSync(path.join(vault, '내집 칼럼', 'old.md'))).toBe(false);
    expect(fs.existsSync(path.join(vault, '뉴스 아카이브', 'old.md'))).toBe(false);
    expect(fs.readFileSync(
      path.join(vault, '내집 칼럼', '운영', '2026-08-11-safe-export.md'),
      'utf8',
    )).toContain('# 본문');
    expect(fs.readFileSync(
      path.join(vault, '뉴스 아카이브', '2026-08', '2026-08-11.md'),
      'utf8',
    )).toContain('테스트 뉴스');
    expect(fs.readFileSync(path.join(vault, '홈.md'), 'utf8')).toContain('발행글 1편');
    expect(fs.readdirSync(vault).some((name) => name.startsWith('.obsidian-export-'))).toBe(false);
  });

  it('환경파일은 고정된 사용자 경로 대신 cwd와 명시적 override를 사용한다', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/export-obsidian.ts'), 'utf8');
    expect(source).toContain('process.env.NAEZIP_ENV_FILE');
    expect(source).toContain("path.resolve(process.cwd(), '.env.local')");
    expect(source).not.toContain("config({ path: '/Users/bangjoohan/real-estate-service/.env.local' })");
  });
});
