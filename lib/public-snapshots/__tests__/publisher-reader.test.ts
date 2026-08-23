import { gunzipSync } from 'node:zlib';

import { describe, expect, it, vi } from 'vitest';

import type { PublicSnapshotObjectStore, PublicSnapshotPutInput } from '../object-store';
import { PUBLIC_TRANSACTION_DISTRICT_COUNT, PUBLIC_TRANSACTION_SHARD_COUNT } from '../contract';
import { encodePublicTransactionShard, sha256Hex } from '../artifact';
import type { PublicTransactionShard } from '../contract';
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
    generatedAt: '2026-08-11T01:02:03.000Z',
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

function fixtureSnapshots() {
  const first = fixtureSnapshot();
  return Array.from({ length: PUBLIC_TRANSACTION_DISTRICT_COUNT }, (_, index) => {
    if (index === 0) return first;
    const lawdCd = String(10_000 + index).padStart(5, '0');
    return createPublicTransactionSnapshot({
      lawdCd,
      district: `테스트구${index}`,
      period: { from: '2026-08-01', through: '2026-08-31' },
      generatedAt: '2026-08-11T01:02:03.000Z',
      records: [],
    });
  });
}

async function publishedFixture() {
  const store = new MemoryStore();
  const result = await publishPublicSnapshotRelease({
    store,
    snapshots: fixtureSnapshots(),
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
    expect(result.manifest.shards).toHaveLength(PUBLIC_TRANSACTION_SHARD_COUNT);
    expect(result.manifest.districts).toHaveLength(PUBLIC_TRANSACTION_DISTRICT_COUNT);
    expect(result.uploads).toHaveLength(PUBLIC_TRANSACTION_SHARD_COUNT + 1 + 2);
    expect(result.manifest.namedArtifacts).toHaveLength(1);
  });

  it('produces identical shard assignments, release id, and bytes for reversed input', async () => {
    const forwardStore = new MemoryStore();
    const reverseStore = new MemoryStore();
    const publishedAt = '2026-08-11T01:02:03.000Z';
    const forward = await publishPublicSnapshotRelease({
      store: forwardStore,
      snapshots: fixtureSnapshots(),
      publishedAt,
    });
    const reverse = await publishPublicSnapshotRelease({
      store: reverseStore,
      snapshots: fixtureSnapshots().reverse(),
      publishedAt,
    });
    expect(reverse.releaseId).toBe(forward.releaseId);
    expect(reverse.manifest.shards.map(({ shardId, districtCount, recordCount }) => ({
      shardId, districtCount, recordCount,
    }))).toEqual(forward.manifest.shards.map(({ shardId, districtCount, recordCount }) => ({
      shardId, districtCount, recordCount,
    })));
    for (const shard of forward.manifest.shards) {
      const left = forwardStore.objects.get(shard.shard.key)!.body;
      const right = reverseStore.objects.get(shard.shard.key)!.body;
      expect(sha256Hex(left)).toBe(sha256Hex(right));
    }
  });

  it('does not publish either manifest if an artifact upload fails', async () => {
    const store = new MemoryStore();
    store.failAt = 1;
    await expect(publishPublicSnapshotRelease({
      store,
      snapshots: fixtureSnapshots(),
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

  it('applies a fresh four-second timeout signal to all three reader fetch paths', async () => {
    const { store } = await publishedFixture();
    const requestSignals: Array<AbortSignal | null | undefined> = [];
    const createdSignals: AbortSignal[] = [];
    const timeoutSignalFactory = vi.fn((_timeoutMs: number) => {
      const signal = new AbortController().signal;
      createdSignals.push(signal);
      return signal;
    });
    const fetchImpl = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestSignals.push(init?.signal);
      const url = new URL(input instanceof Request ? input.url : input.toString());
      const object = store.objects.get(url.pathname.slice(1));
      if (!object) return new Response('missing', { status: 404 });
      return new Response(responseBytes(object.body), { status: 200 });
    }) as unknown as typeof fetch;
    const reader = new PublicSnapshotReader({
      baseUrl: 'https://data.example.test/',
      fetchImpl,
      timeoutSignalFactory,
    });

    const manifest = await reader.getManifest();
    await reader.getDistrictSnapshot('11680', manifest);
    await reader.getNamedArtifact('summary/districts', manifest);

    expect(timeoutSignalFactory.mock.calls.map(([timeoutMs]) => timeoutMs)).toEqual([
      4_000,
      4_000,
      4_000,
    ]);
    expect(requestSignals).toEqual(createdSignals);
    expect(new Set(createdSignals).size).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('honors a bounded custom timeout and sanitizes aborted request errors', async () => {
    const secret = 'DO_NOT_EXPOSE_THIS_PATH';
    const controller = new AbortController();
    controller.abort(new DOMException('timed out', 'TimeoutError'));
    const timeoutSignalFactory = vi.fn((_timeoutMs: number) => controller.signal);
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      throw new Error(`failed to fetch ${input.toString()}?token=${secret}`);
    }) as unknown as typeof fetch;
    const reader = new PublicSnapshotReader({
      baseUrl: `https://data.example.test/${secret}/`,
      fetchImpl,
      timeoutMs: 3_250,
      timeoutSignalFactory,
    });

    let error: unknown;
    try {
      await reader.getManifest();
    } catch (caught) {
      error = caught;
    }

    expect(timeoutSignalFactory).toHaveBeenCalledWith(3_250);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error('expected reader timeout');
    expect(error.message).toBe('Public snapshot manifest request timed out');
    expect(error.message).not.toContain(secret);
    expect(error.message).not.toContain('data.example.test');
    expect(error.message).not.toContain('token');
  });

  it('rejects disabled or unbounded timeout settings before any request', () => {
    expect(() => new PublicSnapshotReader({
      baseUrl: 'https://data.example.test/',
      timeoutMs: 0,
    })).toThrow(/timeoutMs/);
    expect(() => new PublicSnapshotReader({
      baseUrl: 'https://data.example.test/',
      timeoutMs: 30_001,
    })).toThrow(/timeoutMs/);
  });

  it('accepts fetch-transparent gzip decoding but rejects tampered bytes', async () => {
    const { store, result } = await publishedFixture();
    const entry = result.manifest.districts.find(({ lawdCd }) => lawdCd === '11680')!;
    const shard = result.manifest.shards.find(({ shardId }) => shardId === entry.shardId)!;
    const compressed = Buffer.from(store.objects.get(shard.shard.key)!.body);
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

  it('validates every district in the fetched shard against the manifest', async () => {
    const { store, result } = await publishedFixture();
    const manifest = structuredClone(result.manifest);
    const requested = manifest.districts.find(({ lawdCd }) => lawdCd === '11680')!;
    const shardEntry = manifest.shards.find(({ shardId }) => shardId === requested.shardId)!;
    const originalBody = store.objects.get(shardEntry.shard.key)!.body;
    const shard = JSON.parse(gunzipSync(originalBody).toString('utf8')) as PublicTransactionShard;
    const other = shard.snapshots.find((snapshot) => snapshot.partition.lawdCd !== '11680');
    expect(other).toBeDefined();
    other!.partition.district = `${other!.partition.district}-변조`;
    const tampered = encodePublicTransactionShard(shard);
    shardEntry.shard = {
      ...shardEntry.shard,
      sha256: tampered.sha256,
      payloadSha256: tampered.payloadSha256,
      byteLength: tampered.byteLength,
      payloadByteLength: tampered.payloadByteLength,
    };
    const fetchImpl = vi.fn(async () => new Response(responseBytes(tampered.body))) as unknown as typeof fetch;
    const reader = new PublicSnapshotReader({ baseUrl: 'https://data.example.test/', fetchImpl });

    await expect(reader.getDistrictSnapshot('11680', manifest))
      .rejects.toThrow(/district metadata does not match manifest/);
  });

  it('blocks private fields in generic named artifacts', async () => {
    const store = new MemoryStore();
    await expect(publishPublicSnapshotRelease({
      store,
      snapshots: fixtureSnapshots(),
      namedArtifacts: [{
        name: 'apartment-index',
        schema: 'naezip.apartment-index.v1',
        itemCount: 1,
        data: [{ apartmentId: 'apt-1', email: 'private@example.com' }],
      }],
      publishedAt: '2026-08-11T01:02:03.000Z',
    })).rejects.toThrow(/forbidden/);
    expect(store.order).toEqual([]);
  });

  it('rejects a named array artifact whose declared count is wrong', async () => {
    await expect(publishPublicSnapshotRelease({
      store: new MemoryStore(),
      snapshots: fixtureSnapshots(),
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
