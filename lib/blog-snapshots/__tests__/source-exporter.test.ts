import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  PUBLIC_BLOG_SOURCE_SELECT,
  exportPublicBlogSource,
  type PublicBlogSourceQueryClient,
} from '../source-exporter';
import {
  parsePublicBlogSourceExportCliArguments,
  runPublicBlogSourceExportCli,
} from '../../../scripts/export-public-blog-source';

const NOW = new Date('2026-08-21T01:00:00.000Z');
const GENERATED_AT = new Date('2026-08-21T00:00:00.000Z');
const LINEAGE_STARTED_AT = '2026-08-20T00:00:00.000Z';

function queryRow(postCount = 43) {
  const categories = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      slug: 'market',
      name: '시장',
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      slug: 'policy',
      name: '정책',
    },
  ];
  return {
    generatedAt: GENERATED_AT,
    categories: postCount === 0
      ? []
      : categories.slice(0, Math.min(postCount, categories.length)),
    posts: Array.from({ length: postCount }, (_, index) => {
      const category = categories[index % categories.length];
      const ordinal = String(index + 1).padStart(3, '0');
      const timestamp = new Date(
        GENERATED_AT.getTime() - (index + 1) * 60 * 60 * 1_000,
      );
      return {
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        slug: `trusted-post-${ordinal}`,
        title: `검증된 글 ${ordinal}`,
        excerpt: index === 0 ? '공개 요약' : null,
        coverImageUrl: index === 0 ? 'https://images.example.com/cover.png' : null,
        publishedAt: timestamp,
        categorySlug: category.slug,
        categoryName: category.name,
        mdxContent: `# 검증된 글 ${ordinal}\n\n본문입니다.`,
        updatedAt: timestamp.toISOString(),
        status: 'published',
      };
    }),
  };
}

function queryClient(result: unknown = queryRow()): PublicBlogSourceQueryClient & {
  query: ReturnType<typeof vi.fn>;
} {
  return {
    query: vi.fn().mockResolvedValue([result]),
  };
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

describe('trusted public blog source exporter', () => {
  it('uses one published-only SELECT and preserves every exact source field', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-');
    const outputPath = path.join(directory, 'public-blog-source.json');
    const client = queryClient();

    const result = await exportPublicBlogSource({
      queryClient: client,
      outputPath,
      now: NOW,
    });

    expect(client.query).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith(PUBLIC_BLOG_SOURCE_SELECT, [null]);
    const normalizedSql = PUBLIC_BLOG_SOURCE_SELECT.replace(/\s+/g, ' ').trim();
    expect(normalizedSql).toContain("WHERE p.status = 'published'");
    expect(normalizedSql).toContain('p.created_at >= $1::timestamptz');
    expect(normalizedSql).toContain('FROM published_posts');
    expect(normalizedSql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);

    const source = JSON.parse(await readFile(outputPath, 'utf8'));
    expect(Object.keys(source).sort()).toEqual([
      'categories', 'generatedAt', 'posts', 'schema',
    ]);
    expect(source).toMatchObject({
      schema: 'naezip.public-blog.source.v1',
      generatedAt: GENERATED_AT.toISOString(),
      categories: queryRow().categories,
    });
    expect(Object.keys(source.posts[0]).sort()).toEqual([
      'categoryName', 'categorySlug', 'coverImageUrl', 'excerpt', 'id', 'mdxContent',
      'publishedAt', 'slug', 'status', 'title', 'updatedAt',
    ]);
    expect(source.posts).toHaveLength(43);
    expect(source.posts.every((post: { status: string }) => post.status === 'published')).toBe(true);
    expect(source.posts[0]).toMatchObject({
      id: '20000000-0000-4000-8000-000000000001',
      slug: 'trusted-post-001',
      title: '검증된 글 001',
      excerpt: '공개 요약',
      coverImageUrl: 'https://images.example.com/cover.png',
      categorySlug: 'market',
      categoryName: '시장',
      mdxContent: '# 검증된 글 001\n\n본문입니다.',
      publishedAt: '2026-08-20T23:00:00.000Z',
      updatedAt: '2026-08-20T23:00:00.000Z',
      status: 'published',
    });
    expect(result).toMatchObject({
      outputPath,
      postCount: 43,
      categoryCount: 2,
    });
    expect(result.releaseId).toMatch(/^20260821T000000Z-[a-f0-9]{12}$/);
    expect((await lstat(outputPath)).mode & 0o777).toBe(0o600);
  });

  it('atomically replaces an existing regular file and forces mode 0600', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-replace-');
    const outputPath = path.join(directory, 'source.json');
    await writeFile(outputPath, 'previous-success');
    await chmod(outputPath, 0o644);

    await exportPublicBlogSource({
      queryClient: queryClient(),
      outputPath,
      now: NOW,
    });

    expect(await readFile(outputPath, 'utf8')).toContain('naezip.public-blog.source.v1');
    expect((await lstat(outputPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(directory)).toEqual(['source.json']);
  });

  it('leaves the previous success untouched when the 43-post floor fails', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-floor-');
    const outputPath = path.join(directory, 'source.json');
    await writeFile(outputPath, 'previous-success');

    await expect(exportPublicBlogSource({
      queryClient: queryClient(queryRow(42)),
      outputPath,
      now: NOW,
    })).rejects.toThrow('at least 43 published posts are required');

    expect(await readFile(outputPath, 'utf8')).toBe('previous-success');
  });

  it.each([1, 43])(
    'exports %i posts only through the explicit bootstrap continuation mode',
    async (postCount) => {
      const directory = await temporaryDirectory('naezip-blog-source-continuation-');
      const outputPath = path.join(directory, 'source.json');

      if (postCount < 43) {
        await expect(exportPublicBlogSource({
          queryClient: queryClient(queryRow(postCount)),
          outputPath,
          now: NOW,
        })).rejects.toThrow('at least 43 published posts are required');
      }

      const continuationClient = queryClient(queryRow(postCount));
      await expect(exportPublicBlogSource({
        queryClient: continuationClient,
        outputPath,
        now: NOW,
        publicationMode: 'bootstrap-continuation',
        lineageStartedAt: LINEAGE_STARTED_AT,
      })).resolves.toMatchObject({ postCount });
      expect(continuationClient.query)
        .toHaveBeenCalledWith(PUBLIC_BLOG_SOURCE_SELECT, [LINEAGE_STARTED_AT]);
      expect(JSON.parse(await readFile(outputPath, 'utf8')).posts).toHaveLength(postCount);
      expect((await lstat(outputPath)).mode & 0o777).toBe(0o600);
    },
  );

  it.each([0, 44])(
    'rejects a %i-post continuation without replacing the previous export',
    async (postCount) => {
      const directory = await temporaryDirectory('naezip-blog-source-invalid-continuation-');
      const outputPath = path.join(directory, 'source.json');
      await writeFile(outputPath, 'previous-success');

      await expect(exportPublicBlogSource({
        queryClient: queryClient(queryRow(postCount)),
        outputPath,
        now: NOW,
        publicationMode: 'bootstrap-continuation',
        lineageStartedAt: LINEAGE_STARTED_AT,
      })).rejects.toThrow('bootstrap continuation requires 1 to 43 published posts');
      expect(await readFile(outputPath, 'utf8')).toBe('previous-success');
    },
  );

  it('leaves the previous success untouched when strict MDX validation fails', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-mdx-');
    const outputPath = path.join(directory, 'source.json');
    await writeFile(outputPath, 'previous-success');
    const invalid = queryRow();
    invalid.posts[0].mdxContent = '<CredentialStealer token="DO_NOT_ECHO" />';

    let caught: unknown;
    try {
      await exportPublicBlogSource({
        queryClient: queryClient(invalid),
        outputPath,
        now: NOW,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('strict MDX preflight');
    expect((caught as Error).message).not.toContain('CredentialStealer');
    expect((caught as Error).message).not.toContain('DO_NOT_ECHO');
    expect(await readFile(outputPath, 'utf8')).toBe('previous-success');
  });

  it('sanitizes query and write failures without leaking credentials or paths', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-errors-');
    const secretUrl = 'postgresql://private-user:private-password@private-host/database';
    const failedClient: PublicBlogSourceQueryClient = {
      query: vi.fn().mockRejectedValue(new Error(secretUrl)),
    };
    let queryError: unknown;
    try {
      await exportPublicBlogSource({
        queryClient: failedClient,
        outputPath: path.join(directory, 'source.json'),
        now: NOW,
      });
    } catch (error) {
      queryError = error;
    }
    expect((queryError as Error).message).toBe('Public blog source query failed');
    expect((queryError as Error).message).not.toContain(secretUrl);

    const privatePath = path.join(directory, 'DO_NOT_ECHO_DIRECTORY', 'source.json');
    let writeError: unknown;
    try {
      await exportPublicBlogSource({
        queryClient: queryClient(),
        outputPath: privatePath,
        now: NOW,
      });
    } catch (error) {
      writeError = error;
    }
    expect((writeError as Error).message).toBe('Public blog source export write failed');
    expect((writeError as Error).message).not.toContain('DO_NOT_ECHO_DIRECTORY');
    expect((writeError as Error).message).not.toContain(directory);
  });

  it('refuses a symlink destination without modifying its target', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-symlink-');
    const target = path.join(directory, 'private-target.json');
    const outputPath = path.join(directory, 'source.json');
    await writeFile(target, 'private-target');
    await symlink(target, outputPath);

    await expect(exportPublicBlogSource({
      queryClient: queryClient(),
      outputPath,
      now: NOW,
    })).rejects.toThrow('must be absent or a regular file');
    expect(await readFile(target, 'utf8')).toBe('private-target');
    expect((await lstat(outputPath)).isSymbolicLink()).toBe(true);
  });

  it('refuses to write through a symlinked parent directory', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-parent-link-');
    const realParent = path.join(directory, 'private');
    const linkedParent = path.join(directory, 'linked');
    await mkdir(realParent);
    await symlink(realParent, linkedParent);

    await expect(exportPublicBlogSource({
      queryClient: queryClient(),
      outputPath: path.join(linkedParent, 'source.json'),
      now: NOW,
    })).rejects.toThrow('output parent is unsafe');
    expect(await readdir(realParent)).toEqual([]);
  });

  it('requires an explicit absolute output path before querying', async () => {
    const client = queryClient();
    await expect(exportPublicBlogSource({
      queryClient: client,
      outputPath: 'relative-source.json',
      now: NOW,
    })).rejects.toThrow('explicit absolute file path');
    expect(client.query).not.toHaveBeenCalled();

    expect(() => parsePublicBlogSourceExportCliArguments([]))
      .toThrow('--output is required');
    expect(() => parsePublicBlogSourceExportCliArguments(['--output', 'relative.json']))
      .toThrow('--output must be an absolute file path');
    let usageError: unknown;
    try {
      parsePublicBlogSourceExportCliArguments([
        '--output', '/tmp/source.json', '--password=DO_NOT_ECHO',
      ]);
    } catch (error) {
      usageError = error;
    }
    expect((usageError as Error).message).toBe('Unknown public blog source export option');
    expect((usageError as Error).message).not.toContain('DO_NOT_ECHO');

    expect(parsePublicBlogSourceExportCliArguments([
      '--output', '/tmp/source.json',
      '--confirm-bootstrap-continuation',
      '--lineage-started-at', LINEAGE_STARTED_AT,
    ])).toMatchObject({
      confirmBootstrapContinuation: true,
      lineageStartedAt: LINEAGE_STARTED_AT,
    });
    expect(() => parsePublicBlogSourceExportCliArguments([
      '--output', '/tmp/source.json', '--confirm-bootstrap-continuation',
    ])).toThrow('--lineage-started-at is required');
    expect(() => parsePublicBlogSourceExportCliArguments([
      '--output', '/tmp/source.json',
      '--confirm-bootstrap-continuation', '--confirm-bootstrap-continuation',
    ])).toThrow('Duplicate bootstrap continuation confirmation');
    expect(() => parsePublicBlogSourceExportCliArguments([
      '--help', '--confirm-bootstrap-continuation',
    ])).toThrow('Help cannot be combined with export options');
  });

  it('connects the explicit bootstrap continuation CLI flag to the 1..43 policy', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-continuation-cli-');
    const rejectedOutputPath = path.join(directory, 'rejected.json');
    const outputPath = path.join(directory, 'source.json');

    await expect(runPublicBlogSourceExportCli([
      '--output', rejectedOutputPath,
    ], {
      queryClient: queryClient(queryRow(1)),
      now: NOW,
      log: vi.fn(),
    })).rejects.toThrow('at least 43 published posts are required');

    const log = vi.fn();
    await expect(runPublicBlogSourceExportCli([
      '--output', outputPath,
      '--confirm-bootstrap-continuation',
      '--lineage-started-at', LINEAGE_STARTED_AT,
    ], {
      queryClient: queryClient(queryRow(1)),
      now: NOW,
      log,
    })).resolves.toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain('posts=1 categories=1');
    await expect(lstat(rejectedOutputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('logs only release metadata when run through the injected CLI', async () => {
    const directory = await temporaryDirectory('naezip-blog-source-cli-');
    const outputPath = path.join(directory, 'source.json');
    const log = vi.fn();

    await expect(runPublicBlogSourceExportCli([
      '--output', outputPath,
    ], {
      queryClient: queryClient(),
      now: NOW,
      log,
      env: { DATABASE_URL: 'postgresql://DO_NOT_LOG' },
    })).resolves.toBe(0);

    expect(log).toHaveBeenCalledOnce();
    const message = log.mock.calls[0][0] as string;
    expect(message).toMatch(/^\[public-blog-source\] complete: release=/);
    expect(message).toContain('posts=43 categories=2');
    expect(message).not.toContain('검증된 글');
    expect(message).not.toContain('DO_NOT_LOG');
    expect(message).not.toContain(outputPath);
  });
});
