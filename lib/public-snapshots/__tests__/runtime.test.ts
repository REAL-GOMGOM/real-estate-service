import { describe, expect, it, vi } from 'vitest';

import type { PublicSnapshotObjectStore, PublicSnapshotPutInput } from '../object-store';
import { PUBLIC_TRANSACTION_DISTRICT_COUNT } from '../contract';
import { publishPublicSnapshotRelease } from '../publisher';
import {
  PublicSnapshotRuntime,
  createPublicSnapshotRuntimeFromEnv,
  isPublicSnapshotConfigured,
  type PublicSnapshotRuntimeLogEvent,
} from '../runtime';
import { createPublicTransactionSnapshot, toPublicSaleTransaction } from '../source-mappers';

class MemoryStore implements PublicSnapshotObjectStore {
  readonly objects = new Map<string, PublicSnapshotPutInput>();

  async putObject(input: PublicSnapshotPutInput) {
    this.objects.set(input.key, { ...input, body: Buffer.from(input.body) });
    return { key: input.key, url: `memory://${input.key}`, etag: null, byteLength: input.body.byteLength };
  }
}

function responseBytes(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function fixtureStore(): Promise<MemoryStore> {
  const store = new MemoryStore();
  const snapshot = createPublicTransactionSnapshot({
    lawdCd: '11680',
    district: '강남구',
    period: { from: '2026-08-01', through: '2026-08-31' },
    generatedAt: '2026-08-11T00:00:00.000Z',
    records: [toPublicSaleTransaction({
      dedupeKey: 'sale-runtime',
      masterId: 'apt-1',
      aptName: '테스트아파트',
      sigungu: '강남구',
      umdNm: '역삼동',
      areaM2: 84.9,
      floor: 8,
      dealAmount: 210_000,
      dealDate: '2026-08-10',
      buildYear: 2020,
      isCanceled: false,
    })],
  });
  const snapshots = Array.from({ length: PUBLIC_TRANSACTION_DISTRICT_COUNT }, (_, index) => {
    if (index === 0) return snapshot;
    return createPublicTransactionSnapshot({
      lawdCd: String(10_000 + index),
      district: `테스트구${index}`,
      period: { from: '2026-08-01', through: '2026-08-31' },
      generatedAt: '2026-08-11T01:02:03.000Z',
      records: [],
    });
  });
  // The fixture release uses one generatedAt across all 248 strict partitions.
  snapshots[0] = { ...snapshots[0], generatedAt: '2026-08-11T01:02:03.000Z' };
  await publishPublicSnapshotRelease({
    store,
    snapshots,
    namedArtifacts: [{
      name: 'summary/districts',
      schema: 'naezip.transaction-summary.v1',
      itemCount: 1,
      data: [{ lawdCd: '11680', count: 1 }],
    }],
    publishedAt: '2026-08-11T01:02:03.000Z',
  });
  return store;
}

describe('public snapshot fail-open runtime', () => {
  it('distinguishes an absent/blank base URL from configured serving mode', () => {
    expect(isPublicSnapshotConfigured({})).toBe(false);
    expect(isPublicSnapshotConfigured({ NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: '  ' }))
      .toBe(false);
    expect(isPublicSnapshotConfigured({
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: 'https://data.example.test/',
    })).toBe(true);
  });

  it('is disabled with zero network calls when the base URL env is absent', async () => {
    const fetchImpl = vi.fn(async () => new Response('unexpected')) as unknown as typeof fetch;
    const runtime = createPublicSnapshotRuntimeFromEnv({}, { fetchImpl });

    await expect(runtime.getDistrictSnapshot('11680')).resolves.toEqual({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
    await expect(runtime.getNamedArtifact('summary/districts')).resolves.toEqual({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
    await expect(runtime.getManifest()).resolves.toEqual({
      status: 'disabled',
      reason: 'base-url-not-configured',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns success for validated district and named artifacts', async () => {
    const store = await fixtureStore();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const object = store.objects.get(url.pathname.slice(1));
      if (!object) return new Response('missing', { status: 404 });
      return new Response(responseBytes(object.body), { status: 200 });
    }) as unknown as typeof fetch;
    const runtime = createPublicSnapshotRuntimeFromEnv({
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: 'https://data.example.test/',
    }, { fetchImpl });

    const manifest = await runtime.getManifest();
    expect(manifest.status).toBe('success');
    if (manifest.status !== 'success') throw new Error('manifest fixture failed');

    const district = await runtime.getDistrictSnapshot('11680', manifest.data);
    expect(district.status).toBe('success');
    if (district.status === 'success') expect(district.data.recordCount).toBe(1);

    const summary = await runtime.getNamedArtifact<Array<{ lawdCd: string }>>(
      'summary/districts',
      manifest.data,
    );
    expect(summary.status).toBe('success');
    if (summary.status === 'success') expect(summary.data.itemCount).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('marks malformed credentialed/query base URLs unavailable without requesting them', async () => {
    const events: PublicSnapshotRuntimeLogEvent[] = [];
    const fetchImpl = vi.fn(async () => new Response('unexpected')) as unknown as typeof fetch;
    const runtime = new PublicSnapshotRuntime({
      baseUrl: 'https://user:password@data.example.test/?token=secret-value',
      fetchImpl,
      logger: { warn: (event) => events.push(event) },
    });

    await expect(runtime.getDistrictSnapshot('11680')).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid-base-url',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('secret-value');
    expect(serialized).not.toContain('?');
  });

  it('converts reader failures to unavailable without leaking the error URL or query', async () => {
    const events: PublicSnapshotRuntimeLogEvent[] = [];
    const fetchImpl = vi.fn(async () => {
      throw new Error('request failed https://data.example.test/?token=do-not-log');
    }) as unknown as typeof fetch;
    const runtime = new PublicSnapshotRuntime({
      baseUrl: 'https://data.example.test/',
      fetchImpl,
      logger: { warn: (event) => events.push(event) },
    });

    await expect(runtime.getDistrictSnapshot('11680')).resolves.toEqual({
      status: 'unavailable',
      reason: 'read-failed',
    });
    expect(JSON.stringify(events)).toBe(JSON.stringify([{
      event: 'public-snapshot-unavailable',
      operation: 'district',
      reason: 'read-failed',
    }]));
  });

  it('rejects invalid identifiers before network access', async () => {
    const events: PublicSnapshotRuntimeLogEvent[] = [];
    const fetchImpl = vi.fn(async () => new Response('unexpected')) as unknown as typeof fetch;
    const runtime = new PublicSnapshotRuntime({
      baseUrl: 'https://data.example.test/',
      fetchImpl,
      logger: { warn: (event) => events.push(event) },
    });
    await expect(runtime.getDistrictSnapshot('../secret')).resolves.toMatchObject({
      status: 'unavailable', reason: 'invalid-request',
    });
    await expect(runtime.getNamedArtifact('summary/../../secret')).resolves.toMatchObject({
      status: 'unavailable', reason: 'invalid-request',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
  });

  it('remains fail-open when the injected logger itself fails', async () => {
    const runtime = new PublicSnapshotRuntime({
      baseUrl: 'https://data.example.test/',
      logger: { warn: () => { throw new Error('logger unavailable'); } },
    });
    await expect(runtime.getDistrictSnapshot('invalid')).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid-request',
    });
  });
});
