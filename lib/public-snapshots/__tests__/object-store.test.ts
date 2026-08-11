import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../artifact';
import {
  LocalDryRunSnapshotStore,
  PublicSnapshotConfigurationError,
  R2S3SnapshotStore,
  createPublicSnapshotStoreFromEnv,
} from '../object-store';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function putInput(body = Buffer.from('{"ok":true}')) {
  return {
    key: 'public-transactions/v1/manifest.json',
    body,
    contentType: 'application/json' as const,
    cacheControl: 'no-cache',
    sha256: sha256Hex(body),
    immutable: false,
  };
}

describe('public snapshot object stores', () => {
  it('selects local dry-run only when all R2 settings are absent', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'naezip-snapshot-'));
    temporaryDirectories.push(directory);
    const selected = createPublicSnapshotStoreFromEnv({ NAEZIP_SNAPSHOT_DRY_RUN_DIR: directory });
    expect(selected.mode).toBe('local-dry-run');
    await selected.store.putObject(putInput());
    expect(await readFile(path.join(directory, 'public-transactions/v1/manifest.json'), 'utf8')).toBe('{"ok":true}');

    expect(() => createPublicSnapshotStoreFromEnv({
      NAEZIP_SNAPSHOT_R2_ACCOUNT_ID: 'account',
    })).toThrow(PublicSnapshotConfigurationError);
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
    expect(url.toString()).toBe('https://account-id.r2.cloudflarestorage.com/snapshots/public-transactions/v1/manifest.json');
    expect(init?.method).toBe('PUT');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=access-key\/20260811\/auto\/s3\/aws4_request/);
    expect(headers['x-amz-content-sha256']).toBe(putInput().sha256);
  });

  it('rejects dump/database object keys at the adapter boundary', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'naezip-snapshot-'));
    temporaryDirectories.push(directory);
    const store = new LocalDryRunSnapshotStore(directory);
    await expect(store.putObject({
      ...putInput(),
      key: 'public-transactions/v1/releases/database.sql.gz',
    })).rejects.toThrow(/Unsafe public snapshot object key/);
  });
});
