import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { PUBLIC_BLOG_MANIFEST_KEY } from '../contract';
import * as publisherModule from '../publisher';
import {
  buildPublicBlogSnapshotRelease,
  publicBlogReleaseManifestKey,
  publicBlogReleasePayloadKey,
  publishPublicBlogSnapshotDryRun,
  type TrustedPublicBlogSnapshotSource,
} from '../publisher';
import { PublicBlogSnapshotReader } from '../reader';
import { parsePublicBlogSnapshotCliArguments } from '../../../scripts/publish-public-blog';

const NOW = new Date('2026-08-18T00:00:00.000Z');

function fixtureSource(postCount = 43): TrustedPublicBlogSnapshotSource {
  const categoryFixtures = [
    {
      id: '10000000-0000-4000-8000-000000000002',
      slug: 'policy',
      name: '정책',
    },
    {
      id: '10000000-0000-4000-8000-000000000001',
      slug: 'market',
      name: '시장',
    },
  ];
  return {
    schema: 'naezip.public-blog.source.v1',
    generatedAt: '2026-08-17T01:02:03.000Z',
    categories: categoryFixtures,
    posts: Array.from({ length: postCount }, (_, index) => {
      const category = categoryFixtures[index % categoryFixtures.length];
      const ordinal = String(index + 1).padStart(3, '0');
      const publishedAt = new Date(
        Date.parse('2026-08-17T00:00:00.000Z') - index * 60 * 60 * 1_000,
      ).toISOString();
      return {
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        slug: `fixture-post-${ordinal}`,
        title: `고정 글 ${ordinal}`,
        excerpt: index === 0 ? '요약' : null,
        coverImageUrl: index === 0 ? 'https://images.example.com/cover.png' : null,
        publishedAt,
        categorySlug: category.slug,
        categoryName: category.name,
        mdxContent: `# 고정 글 ${ordinal}\n\n본문입니다.`,
        updatedAt: publishedAt,
        status: 'published' as const,
      };
    }),
  };
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function listFiles(root: string, relative = ''): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) results.push(...await listFiles(root, child));
    else if (entry.isFile()) results.push(child.split(path.sep).join('/'));
  }
  return results.sort();
}

describe('offline public blog snapshot publisher', () => {
  it('rejects drafts and unknown source fields without echoing their values', async () => {
    const draft = fixtureSource();
    draft.posts[0].status = 'draft' as 'published';
    await expect(buildPublicBlogSnapshotRelease(draft, {
      now: NOW,
    })).rejects.toThrow('status must equal published');

    const secret = 'DO_NOT_ECHO_SOURCE_SECRET';
    const unknown = fixtureSource() as unknown as Record<string, unknown>;
    unknown[secret] = secret;
    let caught: unknown;
    try {
      await buildPublicBlogSnapshotRelease(unknown, {
        now: NOW,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('forbidden fields');
    expect((caught as Error).message).not.toContain(secret);
  });

  it('rejects malformed and unregistered-component MDX without echoing source text', async () => {
    const malformed = fixtureSource();
    malformed.posts[0].mdxContent = '<div>UNTERMINATED_SECRET';
    await expect(buildPublicBlogSnapshotRelease(malformed, {
      now: NOW,
    })).rejects.not.toThrow('UNTERMINATED_SECRET');
    await expect(buildPublicBlogSnapshotRelease(malformed, {
      now: NOW,
    })).rejects.toThrow('strict MDX preflight');

    const unsafe = fixtureSource();
    unsafe.posts[1].mdxContent = '<CredentialStealer token="DO_NOT_ECHO" />';
    let caught: unknown;
    try {
      await buildPublicBlogSnapshotRelease(unsafe, {
        now: NOW,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('strict MDX preflight');
    expect((caught as Error).message).not.toContain('CredentialStealer');
    expect((caught as Error).message).not.toContain('DO_NOT_ECHO');
  });

  it('produces identical release IDs and bytes for reversed input', async () => {
    const forward = fixtureSource();
    const reverse = fixtureSource();
    reverse.categories.reverse();
    reverse.posts.reverse();
    const left = await buildPublicBlogSnapshotRelease(forward, {
      now: NOW,
    });
    const right = await buildPublicBlogSnapshotRelease(reverse, {
      now: NOW,
    });
    expect(right.releaseId).toBe(left.releaseId);
    expect(right.payloadBody.equals(left.payloadBody)).toBe(true);
    expect(right.manifestBody.equals(left.manifestBody)).toBe(true);
    expect(right.releaseManifestBody.equals(left.releaseManifestBody)).toBe(true);
  });

  it('keeps the production floor while requiring an exact empty-bootstrap policy', async () => {
    await expect(buildPublicBlogSnapshotRelease(fixtureSource(42), { now: NOW }))
      .rejects.toThrow('at least 43');
    await expect(buildPublicBlogSnapshotRelease(fixtureSource(), { now: NOW }))
      .resolves.toMatchObject({
      payload: { posts: expect.any(Array) },
    });
    expect(() => parsePublicBlogSnapshotCliArguments([
      '--source', 'source.json', '--minimum-posts=1',
    ])).toThrow('Unknown public blog snapshot option');
    expect(parsePublicBlogSnapshotCliArguments([
      '--source', 'source.json', '--confirm-empty-bootstrap',
    ])).toMatchObject({ confirmEmptyBootstrap: true });
    expect(() => parsePublicBlogSnapshotCliArguments([
      '--source', 'source.json',
      '--confirm-empty-bootstrap', '--confirm-empty-bootstrap',
    ])).toThrow('Duplicate empty bootstrap confirmation');
    expect(parsePublicBlogSnapshotCliArguments([
      '--source', 'source.json', '--confirm-bootstrap-continuation',
    ])).toMatchObject({ confirmBootstrapContinuation: true });
    expect(() => parsePublicBlogSnapshotCliArguments([
      '--source', 'source.json',
      '--confirm-empty-bootstrap', '--confirm-bootstrap-continuation',
    ])).toThrow('cannot be combined');

    const empty = fixtureSource(0);
    empty.categories = [];
    await expect(buildPublicBlogSnapshotRelease(empty, { now: NOW }))
      .rejects.toThrow('at least 43');
    await expect(buildPublicBlogSnapshotRelease(empty, {
      now: NOW,
      publicationMode: 'empty-bootstrap',
    })).resolves.toMatchObject({
      payload: { categories: [], posts: [] },
      manifest: { payload: { categoryCount: 0, postCount: 0 } },
    });
    await expect(buildPublicBlogSnapshotRelease(fixtureSource(1), {
      now: NOW,
      publicationMode: 'empty-bootstrap',
    })).rejects.toThrow('exactly zero posts and zero categories');
    const emptyWithCategory = fixtureSource(0);
    await expect(buildPublicBlogSnapshotRelease(emptyWithCategory, {
      now: NOW,
      publicationMode: 'empty-bootstrap',
    })).rejects.toThrow('must not contain categories');
    await expect(buildPublicBlogSnapshotRelease(empty, {
      now: NOW,
      publicationMode: 'bootstrap-continuation',
    })).rejects.toThrow('requires 1 to 43');
    await expect(buildPublicBlogSnapshotRelease(fixtureSource(1), {
      now: NOW,
      publicationMode: 'bootstrap-continuation',
    })).resolves.toMatchObject({ manifest: { payload: { postCount: 1 } } });
    await expect(buildPublicBlogSnapshotRelease(fixtureSource(43), {
      now: NOW,
      publicationMode: 'bootstrap-continuation',
    })).resolves.toMatchObject({ manifest: { payload: { postCount: 43 } } });
    await expect(buildPublicBlogSnapshotRelease(fixtureSource(44), {
      now: NOW,
      publicationMode: 'bootstrap-continuation',
    })).rejects.toThrow('requires 1 to 43');
    expect(publisherModule).not.toHaveProperty('writePublicBlogSnapshotDryRun');
    expect(publisherModule).not.toHaveProperty('PUBLIC_BLOG_PRODUCTION_MINIMUM_POSTS');
  });

  it('writes and reads an explicitly approved empty bootstrap locally', async () => {
    const outputDir = await temporaryDirectory('naezip-blog-empty-bootstrap-');
    const source = fixtureSource(0);
    source.categories = [];
    const result = await publishPublicBlogSnapshotDryRun({
      source,
      outputDir,
      now: NOW,
      publicationMode: 'empty-bootstrap',
    });
    expect(result.payload.posts).toEqual([]);
    expect(result.payload.categories).toEqual([]);
    expect(result.manifest.payload).toMatchObject({ postCount: 0, categoryCount: 0 });
  });

  it('finishes every validation before creating an output directory', async () => {
    const parent = await temporaryDirectory('naezip-blog-no-partial-');
    const outputDir = path.join(parent, 'output');
    const source = fixtureSource();
    source.posts[0].status = 'draft' as 'published';
    await expect(publishPublicBlogSnapshotDryRun({
      source,
      outputDir,
      now: NOW,
    })).rejects.toThrow('status must equal published');
    await expect(access(outputDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a symlinked output hierarchy before writing through it', async () => {
    const parent = await temporaryDirectory('naezip-blog-symlink-');
    const outputDir = path.join(parent, 'output');
    const escaped = path.join(parent, 'escaped');
    await Promise.all([mkdir(outputDir), mkdir(escaped)]);
    await symlink(escaped, path.join(outputDir, 'public-blog'), 'dir');
    await expect(publishPublicBlogSnapshotDryRun({
      source: fixtureSource(),
      outputDir,
      now: NOW,
    })).rejects.toThrow('real directories only');
    expect(await readdir(escaped)).toEqual([]);
  });

  it('rejects symlinked immutable files instead of following them', async () => {
    const release = await buildPublicBlogSnapshotRelease(fixtureSource(), { now: NOW });
    for (const linkedName of ['payload.json', 'manifest.json'] as const) {
      const outputDir = await temporaryDirectory(`naezip-blog-immutable-${linkedName}-`);
      const releaseDirectory = path.dirname(path.join(outputDir, release.payloadKey));
      await mkdir(releaseDirectory, { recursive: true });
      const target = path.join(outputDir, `outside-${linkedName}`);
      const payloadPath = path.join(releaseDirectory, 'payload.json');
      const releaseManifestPath = path.join(releaseDirectory, 'manifest.json');
      await writeFile(target, linkedName === 'payload.json'
        ? release.payloadBody
        : release.releaseManifestBody);
      if (linkedName === 'payload.json') {
        await symlink(target, payloadPath);
        await writeFile(releaseManifestPath, release.releaseManifestBody);
      } else {
        await writeFile(payloadPath, release.payloadBody);
        await symlink(target, releaseManifestPath);
      }

      await expect(publishPublicBlogSnapshotDryRun({
        source: fixtureSource(),
        outputDir,
        now: NOW,
      })).rejects.toThrow('existing immutable release is invalid');
      await expect(access(path.join(outputDir, PUBLIC_BLOG_MANIFEST_KEY)))
        .rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('maps filesystem failures to a fixed message without leaking paths', async () => {
    const parent = await temporaryDirectory('naezip-blog-fs-sanitize-');
    const secret = 'DO_NOT_ECHO_PRIVATE_PATH';
    const blockingFile = path.join(parent, secret);
    await writeFile(blockingFile, 'not a directory');
    let caught: unknown;
    try {
      await publishPublicBlogSnapshotDryRun({
        source: fixtureSource(),
        outputDir: path.join(blockingFile, 'output'),
        now: NOW,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('Local public blog snapshot write failed');
    expect((caught as Error).message).not.toContain(secret);
    expect((caught as Error).message).not.toContain(parent);
  });

  it('writes exact local paths, discovery last, and roundtrips through the reader', async () => {
    const outputDir = await temporaryDirectory('naezip-blog-roundtrip-');
    const result = await publishPublicBlogSnapshotDryRun({
      source: fixtureSource(),
      outputDir,
      now: NOW,
    });
    const payloadKey = publicBlogReleasePayloadKey(result.releaseId);
    const releaseManifestKey = publicBlogReleaseManifestKey(result.releaseId);
    expect(result.writtenKeys).toEqual([
      payloadKey,
      releaseManifestKey,
      PUBLIC_BLOG_MANIFEST_KEY,
    ]);
    expect(await listFiles(outputDir)).toEqual([
      PUBLIC_BLOG_MANIFEST_KEY,
      releaseManifestKey,
      payloadKey,
    ].sort());
    expect(await readFile(path.join(outputDir, PUBLIC_BLOG_MANIFEST_KEY)))
      .toEqual(await readFile(path.join(outputDir, releaseManifestKey)));

    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      let body: Buffer;
      try {
        body = await readFile(path.join(outputDir, url.pathname.slice(1)));
      } catch {
        return new Response('missing', { status: 404 });
      }
      return new Response(Uint8Array.from(body).buffer, {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.byteLength),
        },
      });
    }) as unknown as typeof fetch;
    const reader = new PublicBlogSnapshotReader({
      baseUrl: 'https://fixture.public.blob.vercel-storage.com/',
      fetchImpl,
      now: () => NOW,
    });
    await expect(reader.getSnapshot()).resolves.toEqual(result.payload);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
