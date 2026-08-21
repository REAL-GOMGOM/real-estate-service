import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { sha256Hex, stableJson } from '@/lib/public-snapshots/artifact';

import {
  PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS,
  PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
  PublicBlogVercelBlobStore,
  createPublicBlogBlobStoreFromEnv,
} from '../blob-store';
import {
  PUBLIC_BLOG_MANIFEST_KEY,
} from '../contract';
import {
  buildPublicBlogSnapshotRelease,
  type TrustedPublicBlogSnapshotSource,
} from '../publisher';
import { PublicBlogSnapshotReader } from '../reader';
import { publishPublicBlogSnapshotToBlob } from '../remote-publisher';
import {
  parsePublicBlogBlobPublishCliArguments,
  runPublicBlogBlobPublishCli,
} from '../../../scripts/publish-public-blog-to-blob';

const NOW = new Date('2026-08-22T00:00:00.000Z');
const BASE_URL = 'https://blog-store.public.blob.vercel-storage.com/';
const TOKEN = 'vercel_blob_rw_blog-store_test-secret';
const VALID_RELEASE_ID = '20260821T010203Z-aaaaaaaaaaaa';

function source(
  generatedAt = '2026-08-21T01:02:03.000Z',
  titleSuffix = '',
): TrustedPublicBlogSnapshotSource {
  const category = {
    id: '10000000-0000-4000-8000-000000000001',
    slug: 'market',
    name: '시장',
  };
  return {
    schema: 'naezip.public-blog.source.v1',
    generatedAt,
    categories: [category],
    posts: Array.from({ length: 43 }, (_, index) => {
      const ordinal = String(index + 1).padStart(3, '0');
      const timestamp = new Date(Date.parse(generatedAt) - (index + 1) * 3_600_000)
        .toISOString();
      return {
        id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        slug: `blob-post-${ordinal}`,
        title: `Blob 글 ${ordinal}${index === 0 ? titleSuffix : ''}`,
        excerpt: index === 0 ? '공개 요약' : null,
        coverImageUrl: null,
        publishedAt: timestamp,
        categorySlug: category.slug,
        categoryName: category.name,
        mdxContent: `# Blob 글 ${ordinal}\n\n본문`,
        updatedAt: timestamp,
        status: 'published' as const,
      };
    }),
  };
}

interface StoredObject {
  body: Buffer;
  cacheSeconds: number;
  etag: string;
}

function blobMetadata(key: string, object: StoredObject) {
  const url = `${BASE_URL}${key}`;
  return {
    url,
    downloadUrl: `${url}?download=1`,
    pathname: key,
    contentType: 'application/json',
    contentDisposition: 'inline',
    etag: object.etag,
  };
}

function memoryBlobBackend(initial: ReadonlyMap<string, StoredObject> = new Map()) {
  const objects = new Map(initial);
  let etagCounter = objects.size;
  const order: string[] = [];
  const putImpl = vi.fn(async (key: string, rawBody: unknown, rawOptions: unknown) => {
    const options = rawOptions as {
      allowOverwrite?: boolean;
      cacheControlMaxAge?: number;
      ifMatch?: string;
    };
    const existing = objects.get(key);
    if (existing) {
      if (!options.allowOverwrite || (options.ifMatch && options.ifMatch !== existing.etag)) {
        throw new Error('SDK collision token=DO_NOT_ECHO');
      }
    } else if (options.ifMatch) {
      throw new Error('SDK precondition token=DO_NOT_ECHO');
    }
    const stored = {
      body: Buffer.from(rawBody as Uint8Array),
      cacheSeconds: options.cacheControlMaxAge!,
      etag: `etag-${++etagCounter}`,
    };
    objects.set(key, stored);
    order.push(key);
    return blobMetadata(key, stored);
  });
  const getImpl = vi.fn(async (key: string) => {
    const object = objects.get(key);
    if (!object) return null;
    return {
      statusCode: 200 as const,
      stream: new Response(Uint8Array.from(object.body).buffer).body!,
      headers: new Headers({ 'content-length': String(object.body.byteLength) }),
      blob: {
        ...blobMetadata(key, object),
        size: object.body.byteLength,
        uploadedAt: new Date('2026-08-21T02:00:00.000Z'),
        cacheControl: `public, max-age=${object.cacheSeconds}`,
      },
    };
  });
  const publicFetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const object = objects.get(url.pathname.slice(1));
    if (!object) return new Response('missing', { status: 404 });
    return new Response(Uint8Array.from(object.body).buffer, {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(object.body.byteLength),
      },
    });
  }) as unknown as typeof fetch;
  return { getImpl, objects, order, publicFetchImpl, putImpl };
}

function createStore(backend: ReturnType<typeof memoryBlobBackend>) {
  return new PublicBlogVercelBlobStore({
    token: TOKEN,
    publicBaseUrl: BASE_URL,
    putImpl: backend.putImpl as never,
    getImpl: backend.getImpl as never,
    now: () => NOW,
  });
}

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

describe('public blog Vercel Blob publication', () => {
  it('starts the real Node CLI help path without loading a private environment file', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/publish-public-blog-to-blob.ts');
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', scriptPath, '--help',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        NODE_ENV: 'test',
        NAEZIP_ENV_FILE: '/private/this-file-must-not-be-read',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('--confirm-production');
    expect(result.stdout).toContain('--confirm-release');
    expect(result.stdout).not.toContain('injected env');
  });

  it('fails closed when an explicitly selected private environment file is absent', () => {
    const scriptPath = path.resolve(process.cwd(), 'scripts/publish-public-blog-to-blob.ts');
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', scriptPath,
      '--source', '/private/source-must-not-be-read.json',
      '--confirm-release', VALID_RELEASE_ID,
      '--confirm-production',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        NODE_ENV: 'test',
        NAEZIP_ENV_FILE: '/private/environment-must-exist.env',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Public blog environment file could not be loaded');
    expect(result.stderr).not.toContain('/private/');
  });

  it('requires the dedicated token and an exact matching public Blob origin', () => {
    expect(() => createPublicBlogBlobStoreFromEnv({
      BLOB_READ_WRITE_TOKEN: TOKEN,
      NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL: BASE_URL,
    })).toThrow('NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN');
    expect(() => createPublicBlogBlobStoreFromEnv({
      NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN: TOKEN,
      NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL: 'http://blog-store.public.blob.vercel-storage.com/',
    })).toThrow('exact public Vercel Blob origin');
    expect(() => createPublicBlogBlobStoreFromEnv({
      NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN: TOKEN,
      NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL:
        'https://other-store.public.blob.vercel-storage.com/',
    })).toThrow('store does not match');
    expect(() => createPublicBlogBlobStoreFromEnv({
      NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN: TOKEN,
      NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL: `${BASE_URL}public-blog/v1/`,
    })).toThrow('exact public Vercel Blob origin');
    expect(() => createPublicBlogBlobStoreFromEnv({
      NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN: TOKEN,
      NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL:
        'https://blog-store.public.blob.vercel-storage.com:8443/',
    })).toThrow('exact public Vercel Blob origin');
    expect(() => new PublicBlogSnapshotReader({
      baseUrl: 'https://blog-store.public.blob.vercel-storage.com:8443/',
    })).toThrow('exact Vercel Blob public HTTPS origin');
    expect(() => createPublicBlogBlobStoreFromEnv({
      NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN: TOKEN,
      NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL: BASE_URL,
    }, {
      putImpl: vi.fn() as never,
      getImpl: vi.fn() as never,
      now: () => NOW,
    })).not.toThrow();
  });

  it('publishes immutable objects first, discovery last, then completes both readbacks', async () => {
    const backend = memoryBlobBackend();
    const store = createStore(backend);
    const release = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const result = await publishPublicBlogSnapshotToBlob({
      source: source(),
      expectedReleaseId: release.releaseId,
      store,
      publicFetchImpl: backend.publicFetchImpl,
      now: NOW,
    });

    expect(backend.order).toEqual([
      release.payloadKey,
      release.releaseManifestKey,
      PUBLIC_BLOG_MANIFEST_KEY,
    ]);
    expect(backend.putImpl.mock.calls[0][2]).toMatchObject({
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
      contentType: 'application/json',
      token: TOKEN,
      abortSignal: expect.any(AbortSignal),
    });
    expect(backend.putImpl.mock.calls[1][2]).toMatchObject({
      allowOverwrite: false,
      cacheControlMaxAge: PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
    });
    expect(backend.putImpl.mock.calls[2][2]).toMatchObject({
      allowOverwrite: false,
      cacheControlMaxAge: PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS,
    });
    expect(backend.getImpl).toHaveBeenCalledTimes(4);
    expect(backend.getImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        access: 'public',
        token: TOKEN,
        useCache: false,
        headers: { 'accept-encoding': 'identity' },
        abortSignal: expect.any(AbortSignal),
      }),
    );
    expect(backend.publicFetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      releaseId: release.releaseId,
      postCount: 43,
      categoryCount: 1,
      managementReadback: true,
      publicReadback: true,
      manifestUrl: `${BASE_URL}${PUBLIC_BLOG_MANIFEST_KEY}`,
    });
  });

  it('uses conditional ETag replacement and rejects discovery regression or conflict', async () => {
    const olderRelease = await buildPublicBlogSnapshotRelease(
      source('2026-08-20T01:02:03.000Z'),
      { now: NOW },
    );
    const initial = new Map<string, StoredObject>([[PUBLIC_BLOG_MANIFEST_KEY, {
      body: olderRelease.manifestBody,
      cacheSeconds: PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS,
      etag: 'current-etag',
    }]]);
    const backend = memoryBlobBackend(initial);
    const store = createStore(backend);
    const newerRelease = await buildPublicBlogSnapshotRelease(source(), { now: NOW });

    await store.putObject({
      kind: 'discovery-manifest',
      key: PUBLIC_BLOG_MANIFEST_KEY,
      body: newerRelease.manifestBody,
      sha256: sha256Hex(newerRelease.manifestBody),
    });
    expect(backend.putImpl.mock.calls[0][2]).toMatchObject({
      allowOverwrite: true,
      ifMatch: 'current-etag',
    });

    await expect(store.putObject({
      kind: 'discovery-manifest',
      key: PUBLIC_BLOG_MANIFEST_KEY,
      body: olderRelease.manifestBody,
      sha256: sha256Hex(olderRelease.manifestBody),
    })).rejects.toThrow('regression');

    const conflicting = await buildPublicBlogSnapshotRelease(
      source('2026-08-21T01:02:03.000Z', ' 다른 내용'),
      { now: NOW },
    );
    await expect(store.putObject({
      kind: 'discovery-manifest',
      key: PUBLIC_BLOG_MANIFEST_KEY,
      body: conflicting.manifestBody,
      sha256: sha256Hex(conflicting.manifestBody),
    })).rejects.toThrow('conflict');
  });

  it('accepts an exact discovery CAS race without overwriting the winner', async () => {
    const olderRelease = await buildPublicBlogSnapshotRelease(
      source('2026-08-20T01:02:03.000Z'),
      { now: NOW },
    );
    const candidate = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const backend = memoryBlobBackend(new Map([[PUBLIC_BLOG_MANIFEST_KEY, {
      body: olderRelease.manifestBody,
      cacheSeconds: PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS,
      etag: 'older-etag',
    }]]));
    backend.putImpl.mockImplementationOnce(async () => {
      backend.objects.set(PUBLIC_BLOG_MANIFEST_KEY, {
        body: candidate.manifestBody,
        cacheSeconds: PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS,
        etag: 'raced-etag',
      });
      throw new Error('SDK precondition token=DO_NOT_ECHO');
    });

    await expect(createStore(backend).putObject({
      kind: 'discovery-manifest',
      key: PUBLIC_BLOG_MANIFEST_KEY,
      body: candidate.manifestBody,
      sha256: sha256Hex(candidate.manifestBody),
    })).resolves.toMatchObject({ etag: 'raced-etag' });
  });

  it('does not move discovery after a partial immutable failure and recovers on retry', async () => {
    const backend = memoryBlobBackend();
    const defaultPut = backend.putImpl.getMockImplementation()!;
    backend.putImpl
      .mockImplementationOnce(defaultPut)
      .mockRejectedValueOnce(new Error('SDK token=DO_NOT_ECHO') as never);
    const store = createStore(backend);
    const release = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const input = {
      source: source(),
      expectedReleaseId: release.releaseId,
      store,
      publicFetchImpl: backend.publicFetchImpl,
      now: NOW,
    };

    await expect(publishPublicBlogSnapshotToBlob(input)).rejects.toThrow('immutable put failed');
    expect(backend.objects.has(release.payloadKey)).toBe(true);
    expect(backend.objects.has(release.releaseManifestKey)).toBe(false);
    expect(backend.objects.has(PUBLIC_BLOG_MANIFEST_KEY)).toBe(false);

    await expect(publishPublicBlogSnapshotToBlob(input)).resolves.toMatchObject({
      releaseId: release.releaseId,
      managementReadback: true,
      publicReadback: true,
    });
    expect(backend.objects.has(release.releaseManifestKey)).toBe(true);
    expect(backend.objects.has(PUBLIC_BLOG_MANIFEST_KEY)).toBe(true);
  });

  it('verifies immutable readback before moving discovery', async () => {
    const backend = memoryBlobBackend();
    const store = createStore(backend);
    const release = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const readObject = store.readObject.bind(store);
    vi.spyOn(store, 'readObject').mockImplementation(async (input) => {
      if (input.kind === 'release-manifest') {
        throw new Error('management readback unavailable');
      }
      return readObject(input);
    });

    await expect(publishPublicBlogSnapshotToBlob({
      source: source(),
      expectedReleaseId: release.releaseId,
      store,
      publicFetchImpl: backend.publicFetchImpl,
      now: NOW,
    })).rejects.toThrow('management readback unavailable');
    expect(backend.order).toHaveLength(2);
    expect(backend.objects.has(PUBLIC_BLOG_MANIFEST_KEY)).toBe(false);
  });

  it('recovers immutable retries only from exact existing bytes and metadata', async () => {
    const release = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const exact = new Map<string, StoredObject>([[release.payloadKey, {
      body: release.payloadBody,
      cacheSeconds: PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
      etag: 'existing-etag',
    }]]);
    const backend = memoryBlobBackend(exact);
    backend.putImpl.mockRejectedValue(new Error('SDK token=DO_NOT_ECHO') as never);
    const store = createStore(backend);

    await expect(store.putObject({
      kind: 'payload',
      key: release.payloadKey,
      body: release.payloadBody,
      sha256: sha256Hex(release.payloadBody),
    })).resolves.toMatchObject({ etag: 'existing-etag' });

    backend.objects.set(release.payloadKey, {
      body: Buffer.from('{}'),
      cacheSeconds: PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
      etag: 'different-etag',
    });
    let caught: unknown;
    try {
      await store.putObject({
        kind: 'payload',
        key: release.payloadKey,
        body: release.payloadBody,
        sha256: sha256Hex(release.payloadBody),
      });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe('Public blog Blob immutable put failed');
    expect((caught as Error).message).not.toContain('DO_NOT_ECHO');
    expect((caught as Error).message).not.toContain('token');
  });

  it('fails closed on invalid management metadata and a stale public readback', async () => {
    const release = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const getImpl = vi.fn(async (key: string, _options?: unknown) => ({
      statusCode: 200 as const,
      stream: new Response(Uint8Array.from(release.payloadBody).buffer).body!,
      headers: new Headers(),
      blob: {
        ...blobMetadata(key, {
          body: release.payloadBody,
          cacheSeconds: PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
          etag: 'etag',
        }),
        size: release.payloadBody.byteLength,
        uploadedAt: new Date('2026-08-21T02:00:00.000Z'),
        cacheControl: 'public, max-age=60',
      },
    }));
    const store = new PublicBlogVercelBlobStore({
      token: TOKEN,
      publicBaseUrl: BASE_URL,
      getImpl: getImpl as never,
      putImpl: vi.fn() as never,
      now: () => NOW,
    });
    await expect(store.readObject({
      kind: 'payload',
      key: release.payloadKey,
      sha256: sha256Hex(release.payloadBody),
    })).rejects.toThrow('metadata is invalid');
    expect(getImpl.mock.calls[0][1]).toMatchObject({ abortSignal: expect.any(AbortSignal) });

    const backend = memoryBlobBackend();
    const stalePublicFetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-length': '2' },
    })) as unknown as typeof fetch;
    await expect(publishPublicBlogSnapshotToBlob({
      source: source(),
      expectedReleaseId: release.releaseId,
      store: createStore(backend),
      publicFetchImpl: stalePublicFetch,
      now: NOW,
    })).rejects.toThrow();
  });

  it('rejects a mismatched release approval before every remote operation', async () => {
    const candidateSource = source('2026-08-21T01:02:03.000Z', ' PRIVATE_SOURCE_CONTENT');
    const approved = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const candidate = await buildPublicBlogSnapshotRelease(candidateSource, { now: NOW });
    expect(candidate.releaseId).not.toBe(approved.releaseId);

    const directory = await temporaryDirectory('naezip-blog-blob-approval-');
    const sourcePath = path.join(directory, 'trusted-source.json');
    await writeFile(sourcePath, stableJson(candidateSource), { mode: 0o600 });
    const backend = memoryBlobBackend();
    const log = vi.fn();
    let caught: unknown;
    try {
      await runPublicBlogBlobPublishCli([
        '--source', sourcePath,
        '--confirm-release', approved.releaseId,
        '--confirm-production',
      ], {
        env: { BLOB_READ_WRITE_TOKEN: 'CREDENTIAL_DO_NOT_ECHO' },
        store: createStore(backend),
        publicFetchImpl: backend.publicFetchImpl,
        now: NOW,
        log,
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message)
      .toBe('Public blog release approval does not match candidate');
    expect((caught as Error).message).not.toContain('PRIVATE_SOURCE_CONTENT');
    expect((caught as Error).message).not.toContain('CREDENTIAL_DO_NOT_ECHO');
    expect((caught as Error).message).not.toContain(sourcePath);
    expect(log).not.toHaveBeenCalled();
    expect(backend.putImpl).not.toHaveBeenCalled();
    expect(backend.getImpl).not.toHaveBeenCalled();
    expect(backend.publicFetchImpl).not.toHaveBeenCalled();
    expect(backend.objects.size).toBe(0);
  });

  it('keeps the production CLI explicit and does not log source content or credentials', async () => {
    expect(() => parsePublicBlogBlobPublishCliArguments([])).toThrow('--source is required');
    expect(() => parsePublicBlogBlobPublishCliArguments([
      '--source', '/private/source.json',
      '--confirm-production',
    ])).toThrow('--confirm-release is required');
    expect(() => parsePublicBlogBlobPublishCliArguments([
      '--source', '/private/source.json',
      '--confirm-release', VALID_RELEASE_ID,
    ])).toThrow('--confirm-production is required');
    expect(() => parsePublicBlogBlobPublishCliArguments([
      '--source', 'relative.json',
      '--confirm-release', VALID_RELEASE_ID,
      '--confirm-production',
    ])).toThrow('absolute file path');
    expect(() => parsePublicBlogBlobPublishCliArguments([
      '--source', '/private/source.json',
      '--confirm-release', 'not-a-release',
      '--confirm-production',
    ])).toThrow('--confirm-release is invalid');
    expect(() => parsePublicBlogBlobPublishCliArguments([
      '--source', '/private/source.json',
      '--confirm-release', VALID_RELEASE_ID,
      '--confirm-release', VALID_RELEASE_ID,
      '--confirm-production',
    ])).toThrow('Duplicate release confirmation');
    let unknownError: unknown;
    try {
      parsePublicBlogBlobPublishCliArguments([
        '--source', '/private/source.json',
        '--confirm-release', VALID_RELEASE_ID,
        '--confirm-production',
        '--token=DO_NOT_ECHO',
      ]);
    } catch (error) {
      unknownError = error;
    }
    expect((unknownError as Error).message).toBe('Unknown public blog Blob publish option');
    expect((unknownError as Error).message).not.toContain('DO_NOT_ECHO');

    const directory = await temporaryDirectory('naezip-blog-blob-cli-');
    const sourcePath = path.join(directory, 'trusted-source.json');
    await writeFile(sourcePath, stableJson(source()), { mode: 0o600 });
    const release = await buildPublicBlogSnapshotRelease(source(), { now: NOW });
    const backend = memoryBlobBackend();
    const log = vi.fn();
    await expect(runPublicBlogBlobPublishCli([
      '--source', sourcePath,
      '--confirm-release', release.releaseId,
      '--confirm-production',
    ], {
      env: { BLOB_READ_WRITE_TOKEN: 'DO_NOT_LOG' },
      store: createStore(backend),
      publicFetchImpl: backend.publicFetchImpl,
      now: NOW,
      log,
    })).resolves.toBe(0);
    const messages = log.mock.calls.flat().join('\n');
    expect(messages).toContain('managementReadback=ok publicReadback=ok');
    expect(messages).not.toContain('Blob 글');
    expect(messages).not.toContain('DO_NOT_LOG');
    expect(messages).not.toContain(sourcePath);
  });
});
