import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlobNotFoundError } from '@vercel/blob';

import { sha256Hex } from '../artifact';
import {
  PUBLIC_TRANSACTION_DISTRICT_COUNT,
  PUBLIC_TRANSACTION_SHARD_COUNT,
  PUBLIC_TRANSACTION_SNAPSHOT_PREFIX,
} from '../contract';
import {
  LocalDryRunSnapshotStore,
  PUBLIC_SNAPSHOT_RETENTION_LIST_LIMIT,
  PUBLIC_SNAPSHOT_RETENTION_MAX_DELETE_BATCH,
  PublicSnapshotConfigurationError,
  R2S3SnapshotStore,
  VercelBlobSnapshotStore,
  createPublicSnapshotRetentionStoreFromEnv,
  createPublicSnapshotStoreFromEnv,
} from '../object-store';
import { publishPublicSnapshotRelease } from '../publisher';
import { createPublicTransactionSnapshot } from '../source-mappers';

const temporaryDirectories: string[] = [];
const BLOB_TOKEN = 'vercel_blob_rw_store-id_test-secret';
const RELEASE_ID = '20260811T010203Z-aaaaaaaaaaaa';
const RELEASES_PREFIX = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/`;
const RELEASE_PREFIX = `${RELEASES_PREFIX}${RELEASE_ID}/`;
const RELEASE_MANIFEST_KEY = `${RELEASE_PREFIX}manifest.json`;

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function putInput(body = Buffer.from('{"ok":true}')) {
  return {
    key: `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`,
    body,
    contentType: 'application/json' as const,
    cacheControl: 'public, max-age=60, must-revalidate',
    sha256: sha256Hex(body),
    immutable: false,
  };
}

function manifestBody(publishedAt: string, releaseId: string) {
  const districts = Array.from({ length: PUBLIC_TRANSACTION_DISTRICT_COUNT }, (_, index) => ({
    lawdCd: String(10_000 + index),
    district: `테스트구${index}`,
    period: { from: '2026-08-01', through: '2026-08-31' },
    counts: { total: 0, sale: 0, rent: 0, presale: 0 },
    latestDealDate: null,
    shardId: String(index % PUBLIC_TRANSACTION_SHARD_COUNT).padStart(2, '0'),
  }));
  const shards = Array.from({ length: PUBLIC_TRANSACTION_SHARD_COUNT }, (_, index) => {
    const shardId = String(index).padStart(2, '0');
    return {
      shardId,
      districtCount: districts.filter((entry) => entry.shardId === shardId).length,
      recordCount: 0,
      shard: {
        key: `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/shards/${shardId}.json.gz`,
        schema: 'naezip.public-transactions.shard.v2',
        contentType: 'application/json',
        contentEncoding: 'gzip',
        sha256: 'a'.repeat(64),
        payloadSha256: 'b'.repeat(64),
        byteLength: 1,
        payloadByteLength: 1,
      },
    };
  });
  return Buffer.from(JSON.stringify({
    schema: 'naezip.public-transactions.manifest.v2',
    releaseId,
    publishedAt,
    source: {
      provider: 'molit-open-data',
      format: 'normalized-public-records',
      containsPersonalData: false,
    },
    totals: { total: 0, sale: 0, rent: 0, presale: 0 },
    shards,
    districts,
    namedArtifacts: [],
  }));
}

function blobResult(key: string, etag = 'etag-1') {
  const url = `https://store-id.public.blob.vercel-storage.com/${key}`;
  return {
    url,
    downloadUrl: `${url}?download=1`,
    pathname: key,
    contentType: 'application/json',
    contentDisposition: 'inline',
    etag,
  };
}

function blobGetResult(key: string, body: Buffer, etag = 'etag-1') {
  const blob = blobResult(key, etag);
  return {
    statusCode: 200 as const,
    stream: new Response(Uint8Array.from(body).buffer).body!,
    headers: new Headers(),
    blob: {
      ...blob,
      size: body.byteLength,
      uploadedAt: new Date('2026-08-11T01:00:00.000Z'),
      cacheControl: 'public, max-age=60',
    },
  };
}

function listedBlob(
  pathname: string,
  overrides: Partial<ReturnType<typeof blobResult> & {
    size: number;
    uploadedAt: Date;
  }> = {},
) {
  return {
    ...blobResult(pathname),
    size: 123,
    uploadedAt: new Date('2026-08-11T01:00:00.000Z'),
    ...overrides,
  };
}

describe('public snapshot object stores', () => {
  it('selects local dry-run only when no production store is explicitly selected', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'naezip-snapshot-'));
    temporaryDirectories.push(directory);
    const selected = createPublicSnapshotStoreFromEnv({ NAEZIP_SNAPSHOT_DRY_RUN_DIR: directory });
    expect(selected.mode).toBe('local-dry-run');
    await selected.store.putObject(putInput());
    expect(await readFile(path.join(directory, PUBLIC_TRANSACTION_SNAPSHOT_PREFIX, 'manifest.json'), 'utf8')).toBe('{"ok":true}');

    expect(() => createPublicSnapshotStoreFromEnv({
      NAEZIP_SNAPSHOT_R2_ACCOUNT_ID: 'account',
    })).toThrow(PublicSnapshotConfigurationError);
    expect(() => createPublicSnapshotStoreFromEnv({
      NAEZIP_SNAPSHOT_STORE: 'blob',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_blog-store_blog-secret',
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL:
        'https://store-id.public.blob.vercel-storage.com/',
    })).toThrow('NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN');
    expect(() => createPublicSnapshotStoreFromEnv({
      BLOB_READ_WRITE_TOKEN: 'existing-blog-upload-token',
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL:
        'https://store-id.public.blob.vercel-storage.com/',
    })).not.toThrow();
    expect(createPublicSnapshotStoreFromEnv({
      BLOB_READ_WRITE_TOKEN: 'existing-blog-upload-token',
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL:
        'https://store-id.public.blob.vercel-storage.com/',
    }).mode).toBe('local-dry-run');
  });

  it('creates a retention store only from an explicitly selected dedicated Blob configuration', async () => {
    const discoveryKey = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
    const headImpl = vi.fn(async () => listedBlob(discoveryKey, {
      etag: 'retention-factory-etag',
      size: 1,
    }));
    const validEnv = {
      NAEZIP_SNAPSHOT_STORE: 'blob',
      NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN: BLOB_TOKEN,
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL:
        'https://store-id.public.blob.vercel-storage.com/',
    };

    const store = createPublicSnapshotRetentionStoreFromEnv(validEnv, {
      headImpl: headImpl as never,
    });
    await expect(store.headRetentionDiscovery()).resolves.toMatchObject({
      pathname: discoveryKey,
      etag: 'retention-factory-etag',
    });

    expect(() => createPublicSnapshotRetentionStoreFromEnv({
      ...validEnv,
      NAEZIP_SNAPSHOT_STORE: 'r2',
    })).toThrow('explicit NAEZIP_SNAPSHOT_STORE=blob');
    expect(() => createPublicSnapshotRetentionStoreFromEnv({
      NAEZIP_SNAPSHOT_STORE: 'blob',
      BLOB_READ_WRITE_TOKEN: 'generic-blog-token-must-not-be-used',
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL:
        'https://store-id.public.blob.vercel-storage.com/',
    })).toThrow('NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN');
    expect(() => createPublicSnapshotRetentionStoreFromEnv({
      ...validEnv,
      NAEZIP_SNAPSHOT_STORE: undefined,
    })).toThrow('explicit NAEZIP_SNAPSHOT_STORE=blob');
    expect(headImpl).toHaveBeenCalledTimes(1);
  });

  it('uses deterministic public Blob paths and overwrites only the discovery manifest', async () => {
    const putImpl = vi.fn(async (key: string, _body: unknown, _options: unknown) => blobResult(key));
    const getImpl = vi.fn(async () => null);
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      putImpl: putImpl as never,
      getImpl: getImpl as never,
    });

    const immutable = { ...putInput(Buffer.from('immutable')), key: `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/r1/a.json.gz`, immutable: true };
    await store.putObject(immutable);
    const manifest = manifestBody('2026-08-11T01:02:03.000Z', '20260811T010203Z-aaaaaaaaaaaa');
    await store.putObject({ ...putInput(manifest), body: manifest, sha256: sha256Hex(manifest) });

    expect(putImpl.mock.calls[0][2]).toMatchObject({
      access: 'public', addRandomSuffix: false, allowOverwrite: false,
      cacheControlMaxAge: 60,
    });
    expect(putImpl.mock.calls[1][2]).toMatchObject({
      access: 'public', addRandomSuffix: false, allowOverwrite: false,
      cacheControlMaxAge: 60,
    });
    expect(getImpl).toHaveBeenCalledWith(
      `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`,
      expect.objectContaining({ access: 'public', useCache: false }),
    );
  });

  it('uses ETag CAS for an existing discovery manifest and blocks regression', async () => {
    const currentBody = manifestBody('2026-08-11T01:02:03.000Z', '20260811T010203Z-aaaaaaaaaaaa');
    const getImpl = vi.fn(async () => blobGetResult(`${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`, currentBody, 'current-etag'));
    const putImpl = vi.fn(async (key: string, _body: unknown, _options: unknown) => blobResult(key, 'next-etag'));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      putImpl: putImpl as never,
      getImpl: getImpl as never,
    });
    const newer = manifestBody('2026-08-12T01:02:03.000Z', '20260812T010203Z-bbbbbbbbbbbb');
    await store.putObject({ ...putInput(newer), body: newer, sha256: sha256Hex(newer) });
    expect(putImpl.mock.calls[0][2]).toMatchObject({
      allowOverwrite: true,
      ifMatch: 'current-etag',
      addRandomSuffix: false,
    });

    const older = manifestBody('2026-08-10T01:02:03.000Z', '20260810T010203Z-cccccccccccc');
    await expect(store.putObject({ ...putInput(older), body: older, sha256: sha256Hex(older) }))
      .rejects.toThrow('regression');
    expect(putImpl).toHaveBeenCalledTimes(1);
  });

  it('recovers an immutable collision only when existing bytes match exactly', async () => {
    const body = Buffer.from('immutable-body');
    const key = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/r1/a.json.gz`;
    const putImpl = vi.fn(async (_key: string, _body: unknown, _options: unknown) => {
      throw new Error('pathname already exists with token=secret');
    });
    const getImpl = vi.fn(async () => blobGetResult(key, body));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      putImpl: putImpl as never,
      getImpl: getImpl as never,
    });
    await expect(store.putObject({
      ...putInput(body), key, body, sha256: sha256Hex(body), immutable: true,
    })).resolves.toMatchObject({ key, byteLength: body.byteLength });

    getImpl.mockResolvedValue(blobGetResult(key, Buffer.from('different')) as never);
    let error: unknown;
    try {
      await store.putObject({ ...putInput(body), key, body, sha256: sha256Hex(body), immutable: true });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(`Vercel Blob PutObject failed for ${key}`);
    expect((error as Error).message).not.toContain('token');
    expect((error as Error).message).not.toContain('secret');
  });

  it('lists only the dedicated v2 releases prefix with bounded pagination and credentials', async () => {
    const pathname = `${RELEASE_PREFIX}shards/00.json.gz`;
    const listImpl = vi.fn(async () => ({
      blobs: [listedBlob(pathname, { etag: 'listed-etag' })],
      hasMore: true,
      cursor: 'next-page-cursor',
    }));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      listImpl: listImpl as never,
    });

    await expect(store.listRetentionObjects({
      prefix: RELEASES_PREFIX,
      cursor: 'current-page-cursor',
      limit: PUBLIC_SNAPSHOT_RETENTION_LIST_LIMIT,
    })).resolves.toEqual({
      objects: [{
        pathname,
        size: 123,
        uploadedAt: '2026-08-11T01:00:00.000Z',
        etag: 'listed-etag',
      }],
      hasMore: true,
      cursor: 'next-page-cursor',
    });
    expect(listImpl).toHaveBeenCalledWith(expect.objectContaining({
      token: BLOB_TOKEN,
      prefix: RELEASES_PREFIX,
      cursor: 'current-page-cursor',
      limit: 1_000,
      mode: 'expanded',
      abortSignal: expect.any(AbortSignal),
    }));

    await expect(store.listRetentionObjects({ prefix: 'public-transactions/v1/releases/', limit: 1 }))
      .rejects.toThrow('only the public-transactions/v2 releases prefix');
    await expect(store.listRetentionObjects({ prefix: RELEASES_PREFIX, limit: 0 }))
      .rejects.toThrow('list limit is invalid');
    await expect(store.listRetentionObjects({ prefix: RELEASES_PREFIX, limit: 1_001 }))
      .rejects.toThrow('list limit is invalid');
    await expect(store.listRetentionObjects({ prefix: RELEASES_PREFIX, limit: 1, cursor: '  ' }))
      .rejects.toThrow('list cursor is invalid');
    expect(listImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed on invalid pagination and listed objects outside the pinned Blob origin/path', async () => {
    const listImpl = vi.fn()
      .mockResolvedValueOnce({ blobs: [], hasMore: true })
      .mockResolvedValueOnce({
        blobs: [listedBlob(`${RELEASE_PREFIX}shards/00.json.gz`, {
          url: `https://other-store.public.blob.vercel-storage.com/${RELEASE_PREFIX}shards/00.json.gz`,
        })],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        blobs: [listedBlob(`${RELEASE_PREFIX}shards/00.json.gz`, {
          url: `https://store-id.public.blob.vercel-storage.com/${RELEASE_PREFIX}shards/01.json.gz`,
        })],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        blobs: [listedBlob(`public-transactions/v1/releases/${RELEASE_ID}/manifest.json`)],
        hasMore: false,
      });
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      listImpl: listImpl as never,
    });
    const input = { prefix: RELEASES_PREFIX, limit: 1 };

    await expect(store.listRetentionObjects(input)).rejects.toThrow('invalid pagination metadata');
    await expect(store.listRetentionObjects(input)).rejects.toThrow('public URL does not match');
    await expect(store.listRetentionObjects(input)).rejects.toThrow('public URL does not match');
    await expect(store.listRetentionObjects(input)).rejects.toThrow('escaped the v2 releases prefix');
  });

  it('reads only discovery or exact release-root manifests with a dedicated token and timeout', async () => {
    const body = manifestBody('2026-08-11T01:02:03.000Z', RELEASE_ID);
    const getImpl = vi.fn(async (pathname: string) => blobGetResult(pathname, body, 'manifest-etag'));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      getImpl: getImpl as never,
    });

    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, body.byteLength))
      .resolves.toMatchObject({
        pathname: RELEASE_MANIFEST_KEY,
        body,
        etag: 'manifest-etag',
        size: body.byteLength,
        uploadedAt: '2026-08-11T01:00:00.000Z',
      });
    expect(getImpl).toHaveBeenCalledWith(RELEASE_MANIFEST_KEY, expect.objectContaining({
      access: 'public',
      token: BLOB_TOKEN,
      useCache: false,
      headers: { 'accept-encoding': 'identity' },
      abortSignal: expect.any(AbortSignal),
    }));

    const discoveryKey = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
    await expect(store.readRetentionObject(discoveryKey, body.byteLength)).resolves.toMatchObject({
      pathname: discoveryKey,
    });
    for (const pathname of [
      `${RELEASE_PREFIX}shards/00.json.gz`,
      `${RELEASE_PREFIX}artifacts/example/manifest.json`,
      `${RELEASES_PREFIX}not-a-release/manifest.json`,
      `public-transactions/v1/releases/${RELEASE_ID}/manifest.json`,
    ]) {
      await expect(store.readRetentionObject(pathname, body.byteLength))
        .rejects.toThrow('only discovery or release manifests');
    }
    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, 0))
      .rejects.toThrow('byte limit is invalid');
    expect(getImpl).toHaveBeenCalledTimes(2);
  });

  it('keeps identity-encoded discovery GET size aligned with management HEAD', async () => {
    const discoveryKey = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
    const body = manifestBody('2026-08-11T01:02:03.000Z', RELEASE_ID);
    const getImpl = vi.fn(async () => blobGetResult(discoveryKey, body, 'identity-etag'));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      getImpl: getImpl as never,
      headImpl: vi.fn(async () => listedBlob(discoveryKey, {
        etag: 'identity-etag',
        size: body.byteLength,
      })) as never,
    });

    const head = await store.headRetentionDiscovery();
    const read = await store.readRetentionObject(discoveryKey, body.byteLength);
    expect(read).toMatchObject({ body, etag: head?.etag, size: head?.size });
    expect(getImpl).toHaveBeenCalledWith(discoveryKey, expect.objectContaining({
      headers: { 'accept-encoding': 'identity' },
    }));
  });

  it('rejects compressed and unknown content encodings despite requesting identity', async () => {
    const body = Buffer.from('{"complete":true}');
    const compressed = blobGetResult(RELEASE_MANIFEST_KEY, body);
    compressed.headers.set('content-encoding', 'gzip');
    const unknown = blobGetResult(RELEASE_MANIFEST_KEY, body);
    unknown.headers.set('content-encoding', 'rot13');
    const getImpl = vi.fn()
      .mockResolvedValueOnce(compressed)
      .mockResolvedValueOnce(unknown);
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      getImpl: getImpl as never,
    });

    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, body.byteLength))
      .rejects.toThrow(`retention read returned invalid metadata for ${RELEASE_MANIFEST_KEY}`);
    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, body.byteLength))
      .rejects.toThrow(`retention read returned invalid metadata for ${RELEASE_MANIFEST_KEY}`);
  });

  it('fails closed on an unencoded truncated retention body', async () => {
    const body = Buffer.from('{"complete":true}');
    const truncated = blobGetResult(RELEASE_MANIFEST_KEY, body);
    truncated.blob.size = body.byteLength + 1;
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      getImpl: vi.fn(async () => truncated) as never,
    });

    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, body.byteLength + 1))
      .rejects.toThrow(`retention read body length mismatch for ${RELEASE_MANIFEST_KEY}`);
  });

  it('cancels a multi-chunk retention body as soon as it exceeds the byte limit', async () => {
    const maxBytes = 8;
    const cancel = vi.fn();
    const chunks = [Buffer.from('1234'), Buffer.from('5678'), Buffer.from('9')];
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[index];
        index += 1;
        if (chunk) controller.enqueue(chunk);
      },
      cancel,
    });
    const oversized = {
      ...blobGetResult(RELEASE_MANIFEST_KEY, Buffer.alloc(maxBytes)),
      stream,
    };
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      getImpl: vi.fn(async () => oversized) as never,
    });

    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, maxBytes))
      .rejects.toThrow(`retention read returned invalid metadata for ${RELEASE_MANIFEST_KEY}`);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects a retention read whose Blob metadata escapes the pinned origin or pathname', async () => {
    const body = Buffer.from('{}');
    const getImpl = vi.fn()
      .mockResolvedValueOnce({
        ...blobGetResult(RELEASE_MANIFEST_KEY, body),
        blob: {
          ...blobGetResult(RELEASE_MANIFEST_KEY, body).blob,
          url: `https://other-store.public.blob.vercel-storage.com/${RELEASE_MANIFEST_KEY}`,
        },
      })
      .mockResolvedValueOnce({
        ...blobGetResult(RELEASE_MANIFEST_KEY, body),
        blob: {
          ...blobGetResult(RELEASE_MANIFEST_KEY, body).blob,
          pathname: `${RELEASE_PREFIX}shards/00.json.gz`,
        },
      });
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      getImpl: getImpl as never,
    });

    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, body.byteLength))
      .rejects.toThrow('public URL does not match');
    await expect(store.readRetentionObject(RELEASE_MANIFEST_KEY, body.byteLength))
      .rejects.toThrow('unexpected pathname');
  });

  it('heads the exact discovery pathname through the management API with token and timeout', async () => {
    const discoveryKey = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
    const headImpl = vi.fn(async () => listedBlob(discoveryKey, {
      etag: 'fresh-discovery-etag',
      size: 4_096,
      uploadedAt: new Date('2026-08-12T03:04:05.000Z'),
    }));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      headImpl: headImpl as never,
    });

    await expect(store.headRetentionDiscovery()).resolves.toEqual({
      pathname: discoveryKey,
      etag: 'fresh-discovery-etag',
      size: 4_096,
      uploadedAt: '2026-08-12T03:04:05.000Z',
    });
    expect(headImpl).toHaveBeenCalledWith(discoveryKey, {
      token: BLOB_TOKEN,
      abortSignal: expect.any(AbortSignal),
    });
    expect(headImpl).toHaveBeenCalledTimes(1);
  });

  it('fails closed when discovery HEAD metadata escapes the pinned origin or pathname', async () => {
    const discoveryKey = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
    const headImpl = vi.fn()
      .mockResolvedValueOnce(listedBlob(discoveryKey, {
        url: `https://other-store.public.blob.vercel-storage.com/${discoveryKey}`,
      }))
      .mockResolvedValueOnce(listedBlob(`${RELEASE_PREFIX}shards/00.json.gz`))
      .mockResolvedValueOnce(listedBlob(discoveryKey, { size: 0 }));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      headImpl: headImpl as never,
    });

    await expect(store.headRetentionDiscovery()).rejects.toThrow('public URL does not match');
    await expect(store.headRetentionDiscovery()).rejects.toThrow('unexpected pathname');
    await expect(store.headRetentionDiscovery()).rejects.toThrow('invalid metadata');
  });

  it('sanitizes discovery management HEAD SDK failures', async () => {
    const sdkSecret = 'HEAD_SDK_TOKEN_AND_URL_MUST_NOT_LEAK';
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      headImpl: vi.fn(async () => { throw new Error(sdkSecret); }) as never,
    });

    let error: unknown;
    try {
      await store.headRetentionDiscovery();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Vercel Blob retention discovery head failed');
    expect((error as Error).message).not.toContain(sdkSecret);
    expect((error as Error).message).not.toContain(BLOB_TOKEN);
  });

  it('returns null only for an actual BlobNotFoundError from discovery management HEAD', async () => {
    const sdkSecret = 'GENERIC_HEAD_FAILURE_MUST_NOT_BE_EMPTY_STORE';
    const headImpl = vi.fn()
      .mockRejectedValueOnce(new BlobNotFoundError())
      .mockRejectedValueOnce(new Error(sdkSecret));
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      headImpl: headImpl as never,
    });

    await expect(store.headRetentionDiscovery()).resolves.toBeNull();
    await expect(store.headRetentionDiscovery())
      .rejects.toThrow('Vercel Blob retention discovery head failed');
  });

  it('batch-deletes only bounded unique non-manifest objects under v2 releases', async () => {
    const deleteImpl = vi.fn(async (_pathname: string | string[], _options?: unknown) => undefined);
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      deleteImpl: deleteImpl as never,
    });
    const pathnames = [
      `${RELEASE_PREFIX}shards/00.json.gz`,
      `${RELEASE_PREFIX}artifacts/apartment-index.json.gz`,
      `${RELEASE_PREFIX}artifacts/highlights/rolling30.json.gz`,
      `${RELEASE_PREFIX}artifacts/market-live/rolling30.json.gz`,
    ];

    await store.deleteRetentionObjects(pathnames);
    expect(deleteImpl).toHaveBeenCalledWith(pathnames, expect.objectContaining({
      token: BLOB_TOKEN,
      abortSignal: expect.any(AbortSignal),
    }));

    const tooMany = Array.from(
      { length: PUBLIC_SNAPSHOT_RETENTION_MAX_DELETE_BATCH + 1 },
      (_, index) => `${RELEASE_PREFIX}shards/${String(index).padStart(2, '0')}.json.gz`,
    );
    await expect(store.deleteRetentionObjects([])).rejects.toThrow('batch size is invalid');
    await expect(store.deleteRetentionObjects(tooMany)).rejects.toThrow('batch size is invalid');
    await expect(store.deleteRetentionObjects([pathnames[0], pathnames[0]]))
      .rejects.toThrow('duplicate pathnames');
    await expect(store.deleteRetentionObjects([`public-transactions/v1/releases/${RELEASE_ID}/shard.json.gz`]))
      .rejects.toThrow('escaped the v2 releases prefix');
    await expect(store.deleteRetentionObjects([`${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`]))
      .rejects.toThrow('escaped the v2 releases prefix');
    await expect(store.deleteRetentionObjects([RELEASE_MANIFEST_KEY]))
      .rejects.toThrow('require a conditional retention tombstone');
    await expect(store.deleteRetentionObjects([`${RELEASES_PREFIX}not-a-release/manifest.json`]))
      .rejects.toThrow('require a conditional retention tombstone');
    for (const pathname of [
      `${RELEASE_PREFIX}shards/24.json.gz`,
      `${RELEASE_PREFIX}artifacts/future-index.json.gz`,
      `${RELEASE_PREFIX}artifacts/highlights/rolling30/extra.json.gz`,
      `${RELEASE_PREFIX}artifacts/market-live/rolling31.json.gz`,
      `${RELEASE_PREFIX}unknown.json.gz`,
      `${RELEASES_PREFIX}not-a-release/shards/00.json.gz`,
    ]) {
      await expect(store.deleteRetentionObjects([pathname]))
        .rejects.toThrow('not a known v2 release payload');
    }
    await expect(store.deleteRetentionObjects([
      `${RELEASE_PREFIX}shards/00.json.gz`,
      `${RELEASES_PREFIX}20260810T010203Z-bbbbbbbbbbbb/shards/01.json.gz`,
    ])).rejects.toThrow('must contain exactly one release');
    expect(deleteImpl).toHaveBeenCalledTimes(1);
  });

  it('conditionally tombstones only an exact release-root manifest with one pathname and ifMatch', async () => {
    const deleteImpl = vi.fn(async (_pathname: string | string[], _options?: unknown) => undefined);
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      deleteImpl: deleteImpl as never,
    });

    await store.deleteRetentionManifest(RELEASE_MANIFEST_KEY, 'release-manifest-etag');
    expect(deleteImpl).toHaveBeenCalledWith(RELEASE_MANIFEST_KEY, expect.objectContaining({
      token: BLOB_TOKEN,
      ifMatch: 'release-manifest-etag',
      abortSignal: expect.any(AbortSignal),
    }));
    expect(Array.isArray(deleteImpl.mock.calls[0][0])).toBe(false);

    for (const pathname of [
      `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`,
      `${RELEASE_PREFIX}artifacts/example/manifest.json`,
      `${RELEASES_PREFIX}not-a-release/manifest.json`,
      `public-transactions/v1/releases/${RELEASE_ID}/manifest.json`,
    ]) {
      await expect(store.deleteRetentionManifest(pathname, 'etag'))
        .rejects.toThrow('manifest tombstone input is invalid');
    }
    await expect(store.deleteRetentionManifest(RELEASE_MANIFEST_KEY, '  '))
      .rejects.toThrow('manifest tombstone input is invalid');
    expect(deleteImpl).toHaveBeenCalledTimes(1);
  });

  it('sanitizes list, read, batch-delete, and manifest-tombstone SDK failures', async () => {
    const sdkSecret = 'SDK_TOKEN_AND_URL_MUST_NOT_LEAK';
    const failing = vi.fn(async () => { throw new Error(sdkSecret); });
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      listImpl: failing as never,
      getImpl: failing as never,
      deleteImpl: failing as never,
    });

    const cases = [
      store.listRetentionObjects({ prefix: RELEASES_PREFIX, limit: 1 }),
      store.readRetentionObject(RELEASE_MANIFEST_KEY, 1),
      store.deleteRetentionObjects([`${RELEASE_PREFIX}shards/00.json.gz`]),
      store.deleteRetentionManifest(RELEASE_MANIFEST_KEY, 'etag'),
    ];
    const messages: string[] = [];
    for (const operation of cases) {
      try {
        await operation;
      } catch (error) {
        messages.push(error instanceof Error ? error.message : String(error));
      }
    }
    expect(messages).toEqual([
      'Vercel Blob retention list failed',
      `Vercel Blob retention read failed for ${RELEASE_MANIFEST_KEY}`,
      'Vercel Blob retention delete batch failed',
      'Vercel Blob retention manifest tombstone failed',
    ]);
    expect(messages.join('\n')).not.toContain(sdkSecret);
    expect(messages.join('\n')).not.toContain(BLOB_TOKEN);
  });

  it('publisher keeps manifest-last ordering through the Blob adapter', async () => {
    const order: string[] = [];
    const putImpl = vi.fn(async (key: string, _body: unknown, _options: unknown) => {
      order.push(key);
      return blobResult(key);
    });
    const store = new VercelBlobSnapshotStore({
      token: BLOB_TOKEN,
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      putImpl: putImpl as never,
      getImpl: vi.fn(async () => null) as never,
    });
    const snapshots = Array.from({ length: PUBLIC_TRANSACTION_DISTRICT_COUNT }, (_, index) =>
      createPublicTransactionSnapshot({
        lawdCd: String(10_000 + index), district: `테스트구${index}`,
        period: { from: '2026-07-01', through: '2026-08-11' },
        generatedAt: '2026-08-11T01:02:03.000Z', records: [],
      }));
    await publishPublicSnapshotRelease({
      store,
      snapshots,
      publishedAt: '2026-08-11T01:02:03.000Z',
    });
    expect(order.at(-1)).toBe(`${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`);
  });

  it('rejects a Blob token/base store mismatch before any object-store I/O', () => {
    const putImpl = vi.fn();
    const getImpl = vi.fn();
    expect(() => new VercelBlobSnapshotStore({
      token: 'vercel_blob_rw_other-store_secret-must-not-leak',
      publicBaseUrl: 'https://store-id.public.blob.vercel-storage.com/',
      putImpl: putImpl as never,
      getImpl: getImpl as never,
    })).toThrow(
      'NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN store does not match NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL',
    );
    expect(putImpl).not.toHaveBeenCalled();
    expect(getImpl).not.toHaveBeenCalled();
  });

  it('never overwrites an immutable object with different bytes', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'naezip-snapshot-'));
    temporaryDirectories.push(directory);
    const store = new LocalDryRunSnapshotStore(directory);
    const first = { ...putInput(Buffer.from('first')), immutable: true };
    await store.putObject(first);
    await expect(store.putObject({ ...putInput(Buffer.from('second')), immutable: true }))
      .rejects.toThrow(/Immutable object/);
  });

  it('creates an R2-compatible SigV4 PutObject without network access in tests', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(null, {
      status: 200,
      headers: { etag: '"etag"' },
    }));
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const store = new R2S3SnapshotStore({
      accountId: 'account-id',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      bucket: 'snapshots',
      fetchImpl,
      now: () => new Date('2026-08-11T01:02:03.000Z'),
    });
    await store.putObject(putInput());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe(`https://account-id.r2.cloudflarestorage.com/snapshots/${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`);
    expect(init?.method).toBe('PUT');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=access-key\/20260811\/auto\/s3\/aws4_request/);
    expect(headers['x-amz-content-sha256']).toBe(putInput().sha256);
  });

  it('never includes an R2 error body that may echo credential identifiers', async () => {
    const secretIdentifier = 'ACCESS_KEY_IDENTIFIER_MUST_NOT_LEAK';
    const store = new R2S3SnapshotStore({
      accountId: 'account-id',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      bucket: 'snapshots',
      fetchImpl: vi.fn(async () => new Response(
        `<Error><Code>InvalidAccessKeyId</Code><AccessKeyId>${secretIdentifier}</AccessKeyId></Error>`,
        { status: 403 },
      )) as unknown as typeof fetch,
    });

    let error: unknown;
    try {
      await store.putObject(putInput());
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error('expected R2 PutObject to fail');
    expect(error.message).toBe(
      `R2 PutObject failed for ${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json: HTTP 403`,
    );
    expect(error.message).not.toContain(secretIdentifier);
    expect(error.message).not.toContain('InvalidAccessKeyId');
  });

  it.each([
    'http://localhost:9000',
    'https://user:password@example.test',
    'https://example.test?token=secret',
    'https://example.test#fragment',
  ])('rejects an unsafe custom R2 endpoint before sending credentials: %s', (endpoint) => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(() => new R2S3SnapshotStore({
      accountId: 'account-id',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      bucket: 'snapshots',
      endpoint,
      fetchImpl,
    })).toThrow(PublicSnapshotConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects dump/database object keys at the adapter boundary', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'naezip-snapshot-'));
    temporaryDirectories.push(directory);
    const store = new LocalDryRunSnapshotStore(directory);
    await expect(store.putObject({
      ...putInput(),
      key: `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/database.sql.gz`,
    })).rejects.toThrow(/Unsafe public snapshot object key/);
  });
});
