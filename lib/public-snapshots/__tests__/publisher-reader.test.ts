import { gunzipSync } from 'node:zlib';

import { describe, expect, it, vi } from 'vitest';

import type { PublicSnapshotObjectStore, PublicSnapshotPutInput } from '../object-store';
import { PublicSnapshotReader } from '../reader';
import { publishPublicSnapshotRelease, PUBLIC_TRANSACTION_MANIFEST_KEY } from '../publisher';
import { createPublicTransactionSnapshot, toPublicSaleTransaction } from '../source-mappers';

class MemoryStore implements PublicSnapshotObjectStore {
  readonly objects = new Map<string, PublicSnapshotPutInput>();
  readonly order: string[] = [];
  failAt: number | null = null;

  async putObject(input: PublicSnapshotPutInput) {
    if (this.failAt !== null && this.order.length === this.failAt) throw new Error('planned upload failure');
    this.order.push(input.key);
    this.objects.set(input.key, { ...input, body: Buffer.from(input.body) });
    return { key: input.key, url: `memory://${input.key}`, etag: null, byteLength: input.body.byteLength };
  }
}

function responseBytes(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function fixtureSnapshot() {
  return createPublicTransactionSnapshot({
    lawdCd: '11680',
    district: '강남구',
    period: { from: '2026-08-01', through: '2026-08-31' },
    generatedAt: '2026-08-11T00:00:00.000Z',
    records: [toPublicSaleTransaction({
      dedupeKey: 'sale-1',
      masterId: 'apt-1',
      aptName: '테스트아파트',
      sigungu: '강남구',
      umdNm: '역삼동',
      areaM2: 84.9,
      floor: 7,
      dealAmount: 200_000,
      dealDate: '2026-08-10',
      buildYear: 2020,
      isCanceled: false,
    })],
  });
}

async function publishedFixture() {
  const store = new MemoryStore();
  const result = await publishPublicSnapshotRelease({
    store,
    snapshots: [fixtureSnapshot()],
    namedArtifacts: [{
      name: 'summary/districts',
      schema: 'naezip.transaction-summary.v1',
      itemCount: 1,
      data: [{ lawdCd: '11680', district: '강남구', count: 1 }],
    }],
    publishedAt: '2026-08-11T01:02:03.000Z',
  });
  return { store, result };
}

describe('public snapshot publisher and reader', () => {
  it('uploads immutable artifacts first and the discovery manifest last', async () => {
    const { store, result } = await publishedFixture();
    expect(result.releaseId).toMatch(/^20260811T010203Z-[a-f0-9]{12}$/);
    expect(store.order.at(-1)).toBe(PUBLIC_TRANSACTION_MANIFEST_KEY);
    expect(store.objects.get(PUBLIC_TRANSACTION_MANIFEST_KEY)?.immutable).toBe(false);
    expect(store.order.slice(0, -1).every((key) => store.objects.get(key)?.immutable)).toBe(true);
    expect(result.manifest.totals).toEqual({ total: 1, sale: 1, rent: 0, presale: 0 });
    expect(result.manifest.namedArtifacts).toHaveLength(1);
  });

  it('does not publish either manifest if an artifact upload fails', async () => {
    const store = new MemoryStore();
    store.failAt = 1;
    await expect(publishPublicSnapshotRelease({
      store,
      snapshots: [fixtureSnapshot()],
      namedArtifacts: [{
        name: 'summary/districts',
        schema: 'naezip.transaction-summary.v1',
        itemCount: 0,
        data: [],
      }],
      publishedAt: '2026-08-11T01:02:03.000Z',
    })).rejects.toThrow('planned upload failure');
    expect(store.order.some((key) => key.endsWith('/manifest.json'))).toBe(false);
  });

  it('reader verifies manifest, compressed snapshot, counts, and named artifact schema', async () => {
    const { store, result } = await publishedFixture();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const key = url.pathname.slice(1);
      const object = store.objects.get(key);
      if (!object) return new Response('missing', { status: 404 });
      return new Response(responseBytes(object.body), {
        status: 200,
        headers: { 'content-type': object.contentType },
      });
    }) as unknown as typeof fetch;
    const reader = new PublicSnapshotReader({ baseUrl: 'https://data.example.test/', fetchImpl });
    const manifest = await reader.getManifest();
    const snapshot = await reader.getDistrictSnapshot('11680', manifest);
    const summary = await reader.getNamedArtifact<Array<{ lawdCd: string }>>('summary/districts', manifest);
    expect(snapshot.recordCount).toBe(1);
    expect(summary.schema).toBe('naezip.transaction-summary.v1');
    expect(summary.itemCount).toBe(1);
    expect(result.manifest.releaseId).toBe(manifest.releaseId);
  });

  it('accepts fetch-transparent gzip decoding but rejects tampered bytes', async () => {
    const { store, result } = await publishedFixture();
    const entry = result.manifest.districts[0];
    const compressed = Buffer.from(store.objects.get(entry.snapshot.key)!.body);
    const decoded = gunzipSync(compressed);
    const manifestBody = store.objects.get(PUBLIC_TRANSACTION_MANIFEST_KEY)!.body;
    const fetchDecoded = vi.fn(async (input: string | URL | Request) => {
      const key = new URL(input instanceof Request ? input.url : input.toString()).pathname.slice(1);
      if (key === PUBLIC_TRANSACTION_MANIFEST_KEY) return new Response(responseBytes(manifestBody));
      return new Response(responseBytes(decoded));
    }) as unknown as typeof fetch;
    const decodedReader = new PublicSnapshotReader({ baseUrl: 'https://data.example.test/', fetchImpl: fetchDecoded });
    await expect(decodedReader.getDistrictSnapshot('11680')).resolves.toMatchObject({ recordCount: 1 });

    const tampered = Buffer.from(compressed);
    tampered[tampered.length - 1] ^= 0xff;
    const fetchTampered = vi.fn(async (input: string | URL | Request) => {
      const key = new URL(input instanceof Request ? input.url : input.toString()).pathname.slice(1);
      if (key === PUBLIC_TRANSACTION_MANIFEST_KEY) return new Response(responseBytes(manifestBody));
      return new Response(responseBytes(tampered));
    }) as unknown as typeof fetch;
    const tamperedReader = new PublicSnapshotReader({ baseUrl: 'https://data.example.test/', fetchImpl: fetchTampered });
    await expect(tamperedReader.getDistrictSnapshot('11680')).rejects.toThrow(/SHA-256/);
  });

  it('blocks private fields in generic named artifacts', async () => {
    await expect(publishPublicSnapshotRelease({
      store: new MemoryStore(),
      snapshots: [fixtureSnapshot()],
      namedArtifacts: [{
        name: 'apartment-index',
        schema: 'naezip.apartment-index.v1',
        itemCount: 1,
        data: [{ apartmentId: 'apt-1', email: 'private@example.com' }],
      }],
      publishedAt: '2026-08-11T01:02:03.000Z',
    })).rejects.toThrow(/forbidden/);
  });

  it('rejects a named array artifact whose declared count is wrong', async () => {
    await expect(publishPublicSnapshotRelease({
      store: new MemoryStore(),
      snapshots: [fixtureSnapshot()],
      namedArtifacts: [{
        name: 'summary/districts',
        schema: 'naezip.transaction-summary.v1',
        itemCount: 2,
        data: [{ lawdCd: '11680' }],
      }],
      publishedAt: '2026-08-11T01:02:03.000Z',
    })).rejects.toThrow(/data.length/);
  });
});
