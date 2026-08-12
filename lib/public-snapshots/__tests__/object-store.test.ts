import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../artifact';
import {
  PUBLIC_TRANSACTION_DISTRICT_COUNT,
  PUBLIC_TRANSACTION_SHARD_COUNT,
  PUBLIC_TRANSACTION_SNAPSHOT_PREFIX,
} from '../contract';
import {
  LocalDryRunSnapshotStore,
  PublicSnapshotConfigurationError,
  R2S3SnapshotStore,
  VercelBlobSnapshotStore,
  createPublicSnapshotStoreFromEnv,
} from '../object-store';
import { publishPublicSnapshotRelease } from '../publisher';
import { createPublicTransactionSnapshot } from '../source-mappers';

const temporaryDirectories: string[] = [];
const BLOB_TOKEN = 'vercel_blob_rw_store-id_test-secret';

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
