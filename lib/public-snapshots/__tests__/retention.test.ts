import { describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_TRANSACTION_DISTRICT_COUNT,
  PUBLIC_TRANSACTION_SHARD_COUNT,
  PUBLIC_TRANSACTION_SNAPSHOT_PREFIX,
} from '../contract';
import type {
  PublicSnapshotRetentionDiscoveryHead,
  PublicSnapshotRetentionListedObject,
  PublicSnapshotRetentionObjectStore,
  PublicSnapshotRetentionReadResult,
} from '../object-store';
import {
  PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_HEAD_DELAY_MS,
  PUBLIC_SNAPSHOT_RETENTION_DEFAULT_KEEP_COUNT,
  PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_OBJECTS,
  PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_PAGES,
  PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA,
  PublicSnapshotRetentionExecutionError,
  collectAndPlanPublicSnapshotRetention,
  executePublicSnapshotRetention,
  type PublicSnapshotRetentionPlan,
} from '../retention';

const RELEASES_PREFIX = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/`;
const DISCOVERY_PATHNAME = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
const NOW = new Date('2026-08-13T00:00:00.000Z');
const OLD_UPLOAD = '2026-01-01T00:00:00.000Z';
const LEGACY_ARTIFACT_NAMES = [
  'apartment-index',
  'summary/rolling30/buy',
  'summary/rolling30/bunyang',
  'summary/rolling30/jeonse',
  'summary/rolling30/monthly',
] as const;
const CURRENT_ARTIFACT_NAMES = [
  'apartment-index',
  'highlights/rolling30',
  'market-live/rolling30',
  'summary/rolling30/buy',
  'summary/rolling30/bunyang',
  'summary/rolling30/jeonse',
  'summary/rolling30/monthly',
] as const;
const EXTENDED_ARTIFACT_NAMES = [
  ...CURRENT_ARTIFACT_NAMES,
  'districts/rolling30',
  'ranking/trade-stats',
] as const;

interface ReleaseFixture {
  releaseId: string;
  publishedAt: string;
  body: Buffer;
  objects: PublicSnapshotRetentionListedObject[];
  read: PublicSnapshotRetentionReadResult;
}

function makeRelease(
  releaseId: string,
  publishedAt: string,
  uploadedAt = OLD_UPLOAD,
  artifactNames: readonly string[] = LEGACY_ARTIFACT_NAMES,
): ReleaseFixture {
  const districts = Array.from({ length: PUBLIC_TRANSACTION_DISTRICT_COUNT }, (_, index) => ({
    lawdCd: String(10_000 + index),
    district: `테스트구${index}`,
    period: { from: '2026-01-01', through: '2026-01-31' },
    counts: { total: 0, sale: 0, rent: 0, presale: 0 },
    latestDealDate: null,
    shardId: String(index % PUBLIC_TRANSACTION_SHARD_COUNT).padStart(2, '0'),
  }));
  const shards = Array.from({ length: PUBLIC_TRANSACTION_SHARD_COUNT }, (_, index) => {
    const shardId = String(index).padStart(2, '0');
    return {
      shardId,
      districtCount: districts.filter((district) => district.shardId === shardId).length,
      recordCount: 0,
      shard: {
        key: `${RELEASES_PREFIX}${releaseId}/shards/${shardId}.json.gz`,
        schema: 'naezip.public-transactions.shard.v2',
        contentType: 'application/json',
        contentEncoding: 'gzip',
        sha256: 'a'.repeat(64),
        payloadSha256: 'b'.repeat(64),
        byteLength: 100 + index,
        payloadByteLength: 200 + index,
      },
    };
  });
  const namedArtifacts = artifactNames.map((name, index) => ({
    name,
    artifact: {
      key: `${RELEASES_PREFIX}${releaseId}/artifacts/${name}.json.gz`,
      schema: 'naezip.test-artifact.v1',
      itemCount: 0,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      sha256: 'c'.repeat(64),
      payloadSha256: 'd'.repeat(64),
      byteLength: 300 + index,
      payloadByteLength: 400 + index,
    },
  }));
  const body = Buffer.from(JSON.stringify({
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
    namedArtifacts,
  }));
  const manifestPathname = `${RELEASES_PREFIX}${releaseId}/manifest.json`;
  const objects: PublicSnapshotRetentionListedObject[] = [
    ...shards.map(({ shard }, index) => ({
      pathname: shard.key,
      size: shard.byteLength,
      uploadedAt,
      etag: `shard-${releaseId}-${index}`,
    })),
    ...namedArtifacts.map(({ artifact }, index) => ({
      pathname: artifact.key,
      size: artifact.byteLength,
      uploadedAt,
      etag: `artifact-${releaseId}-${index}`,
    })),
    {
      pathname: manifestPathname,
      size: body.byteLength,
      uploadedAt,
      etag: `manifest-${releaseId}`,
    },
  ].sort((left, right) => left.pathname.localeCompare(right.pathname));
  return {
    releaseId,
    publishedAt,
    body,
    objects,
    read: {
      pathname: manifestPathname,
      body,
      etag: `manifest-${releaseId}`,
      size: body.byteLength,
      uploadedAt,
    },
  };
}

function makeOrphan(
  releaseId: string,
  uploadedAt = OLD_UPLOAD,
  count = 3,
): PublicSnapshotRetentionListedObject[] {
  return Array.from({ length: count }, (_, index) => ({
    pathname: `${RELEASES_PREFIX}${releaseId}/shards/${String(index).padStart(2, '0')}.json.gz`,
    size: 50 + index,
    uploadedAt,
    etag: `orphan-${releaseId}-${index}`,
  }));
}

function createStore(input: {
  releases?: ReleaseFixture[];
  current?: ReleaseFixture | null;
  extraObjects?: PublicSnapshotRetentionListedObject[];
}) {
  const releases = input.releases ?? [];
  const objects = [
    ...releases.flatMap(({ objects: releaseObjects }) => releaseObjects),
    ...(input.extraObjects ?? []),
  ].sort((left, right) => left.pathname.localeCompare(right.pathname));
  const deletedPathnames = new Set<string>();
  const reads = new Map(releases.map((release) => [release.read.pathname, release.read]));
  const current = input.current ?? null;
  const discoveryEtag = current ? `discovery-${current.releaseId}` : null;
  const discoveryHead: PublicSnapshotRetentionDiscoveryHead | null = current ? {
    pathname: DISCOVERY_PATHNAME,
    etag: discoveryEtag!,
    size: current.body.byteLength,
    uploadedAt: current.read.uploadedAt,
  } : null;
  if (current) {
    reads.set(DISCOVERY_PATHNAME, {
      pathname: DISCOVERY_PATHNAME,
      body: current.body,
      etag: discoveryEtag!,
      size: current.body.byteLength,
      uploadedAt: current.read.uploadedAt,
    });
  }
  const listRetentionObjects = vi.fn(async ({ prefix, cursor, limit }: {
    prefix: string;
    cursor?: string;
    limit: number;
  }) => {
    const offset = cursor ? Number(cursor) : 0;
    const visibleObjects = objects.filter((object) => (
      !deletedPathnames.has(object.pathname) && object.pathname.startsWith(prefix)
    ));
    const pageObjects = visibleObjects.slice(offset, offset + limit);
    const nextOffset = offset + pageObjects.length;
    return {
      objects: pageObjects,
      hasMore: nextOffset < visibleObjects.length,
      cursor: nextOffset < visibleObjects.length ? String(nextOffset) : null,
    };
  });
  const readRetentionObject = vi.fn(async (pathname: string) => reads.get(pathname) ?? null);
  const headRetentionDiscovery = vi.fn(async () => discoveryHead);
  const headRetentionObject = vi.fn(async (pathname: string) => {
    const object = objects.find((entry) => entry.pathname === pathname);
    if (!object || deletedPathnames.has(pathname)) return null;
    return { ...object };
  });
  const deleteRetentionManifest = vi.fn(async (pathname: string, _etag: string) => {
    deletedPathnames.add(pathname);
  });
  const deleteRetentionObjects = vi.fn(async (pathnames: readonly string[]) => {
    for (const pathname of pathnames) deletedPathnames.add(pathname);
  });
  const store: PublicSnapshotRetentionObjectStore = {
    listRetentionObjects,
    readRetentionObject,
    headRetentionDiscovery,
    headRetentionObject,
    deleteRetentionManifest,
    deleteRetentionObjects,
  };
  return {
    store,
    objects,
    discoveryHead,
    listRetentionObjects,
    readRetentionObject,
    headRetentionDiscovery,
    headRetentionObject,
    deleteRetentionManifest,
    deleteRetentionObjects,
  };
}

function releaseId(timestamp: string, digestCharacter: string): string {
  return `${timestamp}-${digestCharacter.repeat(12)}`;
}

describe('public snapshot retention planner', () => {
  it('uses the intended production safety defaults', () => {
    expect(PUBLIC_SNAPSHOT_RETENTION_DEFAULT_KEEP_COUNT).toBe(30);
    expect(PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_HEAD_DELAY_MS).toBe(100);
    expect(PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_PAGES).toBe(20);
    expect(PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_OBJECTS).toBe(10_000);
  });

  it('accepts complete legacy five, current seven, and extended nine-artifact releases', async () => {
    const variants = [
      { label: 'legacy', artifactNames: LEGACY_ARTIFACT_NAMES },
      { label: 'current', artifactNames: CURRENT_ARTIFACT_NAMES },
      { label: 'extended', artifactNames: EXTENDED_ARTIFACT_NAMES },
    ] as const;

    for (const { label, artifactNames } of variants) {
      const current = makeRelease(
        releaseId('20260812T000000Z', 'f'),
        '2026-08-12T00:00:00.000Z',
        '2026-08-12T00:01:00.000Z',
        artifactNames,
      );
      const rollback = makeRelease(
        releaseId('20260401T000000Z', 'e'),
        '2026-04-01T00:00:00.000Z',
        OLD_UPLOAD,
        artifactNames,
      );
      const old = makeRelease(
        releaseId('20260101T000000Z', 'd'),
        '2026-01-01T00:00:00.000Z',
        OLD_UPLOAD,
        artifactNames,
      );
      const fixture = createStore({ releases: [old, rollback, current], current });

      const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, {
        now: NOW,
        keepCompleteReleaseCount: 2,
      });
      const candidate = plan.deleteCandidates[0];
      const expectedPayloadCount = PUBLIC_TRANSACTION_SHARD_COUNT + artifactNames.length;
      expect(candidate, label).toMatchObject({
        releaseId: old.releaseId,
        kind: 'complete-release',
        objectCount: expectedPayloadCount + 1,
      });
      expect(candidate.payloadPathnames, label).toHaveLength(expectedPayloadCount);
      for (const artifactName of artifactNames) {
        expect(candidate.payloadPathnames, label).toContain(
          `${RELEASES_PREFIX}${old.releaseId}/artifacts/${artifactName}.json.gz`,
        );
      }
      expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
    }
  });

  it('rejects six-artifact and unknown-artifact release mixes without deleting', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
      CURRENT_ARTIFACT_NAMES,
    );
    const sixArtifactRelease = makeRelease(
      releaseId('20260101T000000Z', 'd'),
      '2026-01-01T00:00:00.000Z',
      OLD_UPLOAD,
      [...LEGACY_ARTIFACT_NAMES, 'highlights/rolling30'],
    );
    const sixArtifactFixture = createStore({
      releases: [sixArtifactRelease, current],
      current,
    });
    await expect(collectAndPlanPublicSnapshotRetention(sixArtifactFixture.store, { now: NOW }))
      .rejects.toThrow('exact serving artifact set');

    const unknownArtifactRelease = makeRelease(
      releaseId('20260101T000000Z', 'c'),
      '2026-01-01T00:00:00.000Z',
      OLD_UPLOAD,
      [...CURRENT_ARTIFACT_NAMES.slice(0, -1), 'future/rolling30'],
    );
    const unknownArtifactFixture = createStore({
      releases: [unknownArtifactRelease, current],
      current,
    });
    await expect(collectAndPlanPublicSnapshotRetention(unknownArtifactFixture.store, { now: NOW }))
      .rejects.toThrow('unknown or malformed');

    expect(sixArtifactFixture.deleteRetentionObjects).not.toHaveBeenCalled();
    expect(unknownArtifactFixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('permits a first seed only when both discovery and release inventory are empty', async () => {
    const fixture = createStore({ current: null });
    const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, { now: NOW });

    expect(plan).toMatchObject({
      schema: PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA,
      currentReleaseId: null,
      currentDiscoveryEtag: null,
      inventoryObjectCount: 0,
      deleteCandidates: [],
    });
    expect(fixture.readRetentionObject).not.toHaveBeenCalled();
    expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('fails closed when discovery is missing but inventory is not empty', async () => {
    const orphan = makeOrphan(releaseId('20260101T000000Z', 'a'));
    const fixture = createStore({ current: null, extraObjects: orphan });

    await expect(collectAndPlanPublicSnapshotRetention(fixture.store, { now: NOW }))
      .rejects.toThrow('Discovery is absent');
    expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('protects current, rollback, count-window, and age-window releases and selects only fully old releases', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const rollback = makeRelease(
      releaseId('20260501T000000Z', 'e'),
      '2026-05-01T00:00:00.000Z',
    );
    const old = makeRelease(
      releaseId('20260101T000000Z', 'd'),
      '2026-01-01T00:00:00.000Z',
    );
    const fixture = createStore({ releases: [old, current, rollback], current });
    const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, {
      now: NOW,
      keepCompleteReleaseCount: 2,
    });

    expect(plan.currentReleaseId).toBe(current.releaseId);
    expect(plan.protectedReleaseIds).toEqual(expect.arrayContaining([current.releaseId, rollback.releaseId]));
    expect(plan.deleteCandidates).toHaveLength(1);
    expect(plan.deleteCandidates[0]).toMatchObject({
      releaseId: old.releaseId,
      kind: 'complete-release',
      objectCount: 30,
    });
    expect(plan.deleteCandidates[0].payloadPathnames).toHaveLength(29);
  });

  it('does not delete an old release when even one listed object was uploaded inside the retention window', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const rollback = makeRelease(
      releaseId('20260401T000000Z', 'e'),
      '2026-04-01T00:00:00.000Z',
    );
    const old = makeRelease(
      releaseId('20260101T000000Z', 'd'),
      '2026-01-01T00:00:00.000Z',
    );
    old.objects[0].uploadedAt = '2026-08-10T00:00:00.000Z';
    const fixture = createStore({ releases: [old, current, rollback], current });

    const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, {
      now: NOW,
      keepCompleteReleaseCount: 2,
    });
    expect(plan.deleteCandidates).toEqual([]);
  });

  it('chooses rollback from releases strictly older than current when discovery was rolled back', async () => {
    const newer = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const current = makeRelease(
      releaseId('20260601T000000Z', 'e'),
      '2026-06-01T00:00:00.000Z',
    );
    const previous = makeRelease(
      releaseId('20260401T000000Z', 'd'),
      '2026-04-01T00:00:00.000Z',
    );
    const oldest = makeRelease(
      releaseId('20260101T000000Z', 'c'),
      '2026-01-01T00:00:00.000Z',
    );
    const fixture = createStore({ releases: [oldest, current, newer, previous], current });

    const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, {
      now: NOW,
      keepCompleteReleaseCount: 1,
    });
    expect(plan.protectedReleaseIds).toEqual(expect.arrayContaining([
      newer.releaseId,
      current.releaseId,
      previous.releaseId,
    ]));
    expect(plan.deleteCandidates.map(({ releaseId: id }) => id)).toEqual([oldest.releaseId]);
  });

  it('selects only missing-manifest payload orphans older than 72 hours', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const oldId = releaseId('20260101T000000Z', 'a');
    const recentId = releaseId('20260812T000000Z', 'b');
    const fixture = createStore({
      releases: [current],
      current,
      extraObjects: [
        ...makeOrphan(oldId),
        ...makeOrphan(recentId, '2026-08-12T23:00:00.000Z'),
      ],
    });

    const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, { now: NOW });
    expect(plan.deleteCandidates).toEqual([
      expect.objectContaining({ releaseId: oldId, kind: 'orphan-payloads', objectCount: 3 }),
    ]);
  });

  it('rejects unknown paths, incomplete releases, and manifest size mismatches without deleting', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const unknown = createStore({
      releases: [current],
      current,
      extraObjects: [{
        pathname: `${RELEASES_PREFIX}${releaseId('20260101T000000Z', 'a')}/private.dump`,
        size: 1,
        uploadedAt: OLD_UPLOAD,
        etag: 'bad',
      }],
    });
    await expect(collectAndPlanPublicSnapshotRetention(unknown.store, { now: NOW }))
      .rejects.toThrow('unknown or malformed');

    const incompleteRelease = makeRelease(
      releaseId('20260101T000000Z', 'd'),
      '2026-01-01T00:00:00.000Z',
    );
    incompleteRelease.objects = incompleteRelease.objects.slice(1);
    const incomplete = createStore({ releases: [current, incompleteRelease], current });
    await expect(collectAndPlanPublicSnapshotRetention(incomplete.store, { now: NOW }))
      .rejects.toThrow('incomplete');

    const mismatchRelease = makeRelease(
      releaseId('20260101T000000Z', 'c'),
      '2026-01-01T00:00:00.000Z',
    );
    mismatchRelease.objects.find(({ pathname }) => pathname.endsWith('/shards/00.json.gz'))!.size += 1;
    const mismatch = createStore({ releases: [current, mismatchRelease], current });
    await expect(collectAndPlanPublicSnapshotRetention(mismatch.store, { now: NOW }))
      .rejects.toThrow('payload size');

    expect(unknown.deleteRetentionObjects).not.toHaveBeenCalled();
    expect(incomplete.deleteRetentionObjects).not.toHaveBeenCalled();
    expect(mismatch.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('requires discovery HEAD and GET metadata plus immutable body identity to agree', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const metadataMismatch = createStore({ releases: [current], current });
    metadataMismatch.readRetentionObject.mockImplementation(async (pathname: string) => {
      if (pathname === DISCOVERY_PATHNAME) {
        return { ...current.read, pathname, etag: 'stale-discovery' };
      }
      return current.read;
    });
    await expect(collectAndPlanPublicSnapshotRetention(metadataMismatch.store, { now: NOW }))
      .rejects.toThrow('does not match the management inventory');

    const bodyMismatch = createStore({ releases: [current], current });
    bodyMismatch.readRetentionObject.mockImplementation(async (pathname: string) => {
      if (pathname === DISCOVERY_PATHNAME) {
        return {
          pathname,
          body: Buffer.from(current.body.toString().replace('테스트구0', '테스트동0')),
          etag: bodyMismatch.discoveryHead!.etag,
          size: current.body.byteLength,
          uploadedAt: current.read.uploadedAt,
        };
      }
      return current.read;
    });
    await expect(collectAndPlanPublicSnapshotRetention(bodyMismatch.store, { now: NOW }))
      .rejects.toThrow('byte-identical');
  });

  it('fails bounded pagination on missing/repeated cursors, non-strict paths, and caps', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const missingCursor = createStore({ releases: [current], current });
    missingCursor.listRetentionObjects.mockResolvedValue({
      objects: [], hasMore: true, cursor: null,
    });
    await expect(collectAndPlanPublicSnapshotRetention(missingCursor.store, { now: NOW }))
      .rejects.toThrow('missing or repeated cursor');

    const repeatedCursor = createStore({ releases: [current], current });
    repeatedCursor.listRetentionObjects.mockResolvedValue({
      objects: [], hasMore: true, cursor: 'same',
    });
    await expect(collectAndPlanPublicSnapshotRetention(repeatedCursor.store, { now: NOW }))
      .rejects.toThrow('missing or repeated cursor');

    const nonStrict = createStore({ releases: [current], current });
    nonStrict.listRetentionObjects.mockResolvedValue({
      objects: [current.objects[0], current.objects[0]], hasMore: false, cursor: null,
    });
    await expect(collectAndPlanPublicSnapshotRetention(nonStrict.store, { now: NOW }))
      .rejects.toThrow('strictly lexicographically ordered');

    const cap = createStore({ releases: [current], current });
    await expect(collectAndPlanPublicSnapshotRetention(cap.store, {
      now: NOW,
      listLimit: 1,
      maxPages: 1,
    })).rejects.toThrow('maximum page count');

    const oversizedPage = createStore({ releases: [current], current });
    oversizedPage.listRetentionObjects.mockResolvedValue({
      objects: current.objects.slice(0, 2), hasMore: false, cursor: null,
    });
    await expect(collectAndPlanPublicSnapshotRetention(oversizedPage.store, {
      now: NOW,
      listLimit: 1,
    })).rejects.toThrow('more objects than requested');

    for (const fixture of [missingCursor, repeatedCursor, nonStrict, cap, oversizedPage]) {
      expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
    }
  });
});

describe('public snapshot retention executor', () => {
  async function deletablePlan(
    artifactNames: readonly string[] = LEGACY_ARTIFACT_NAMES,
  ) {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
      artifactNames,
    );
    const rollback = makeRelease(
      releaseId('20260401T000000Z', 'e'),
      '2026-04-01T00:00:00.000Z',
      OLD_UPLOAD,
      artifactNames,
    );
    const old = makeRelease(
      releaseId('20260101T000000Z', 'd'),
      '2026-01-01T00:00:00.000Z',
      OLD_UPLOAD,
      artifactNames,
    );
    const fixture = createStore({ releases: [old, rollback, current], current });
    const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, {
      now: NOW,
      keepCompleteReleaseCount: 2,
    });
    return { fixture, plan, old };
  }

  it('re-HEADs, conditionally tombstones, then rate-spaces payload batches', async () => {
    const { fixture, plan, old } = await deletablePlan();
    const sleep = vi.fn(async (_milliseconds: number) => undefined);
    const result = await executePublicSnapshotRetention(fixture.store, plan, { sleep });

    expect(fixture.headRetentionDiscovery).toHaveBeenCalledTimes(2); // plan + execution
    expect(fixture.deleteRetentionManifest).toHaveBeenCalledWith(
      `${RELEASES_PREFIX}${old.releaseId}/manifest.json`,
      `manifest-${old.releaseId}`,
    );
    expect(fixture.deleteRetentionObjects.mock.calls.map(([batch]) => batch.length)).toEqual([10, 10, 9]);
    expect(sleep.mock.calls.filter(([milliseconds]) => milliseconds === 1_000)).toHaveLength(2);
    expect(sleep.mock.calls.filter(([milliseconds]) => milliseconds === 100)).toHaveLength(29);
    expect(sleep).toHaveBeenNthCalledWith(1, 1_000);
    expect(result).toMatchObject({
      completedReleaseIds: [old.releaseId],
      manifestTombstones: [`${RELEASES_PREFIX}${old.releaseId}/manifest.json`],
    });
    expect(result.payloadObjectsDeleted).toHaveLength(29);
  });

  it('executes a current seven-artifact release plan including both new exact paths', async () => {
    const { fixture, plan, old } = await deletablePlan(CURRENT_ARTIFACT_NAMES);
    const result = await executePublicSnapshotRetention(fixture.store, plan, {
      sleep: async () => undefined,
    });

    expect(fixture.deleteRetentionObjects.mock.calls.map(([batch]) => batch.length))
      .toEqual([10, 10, 10, 1]);
    expect(result.payloadObjectsDeleted).toHaveLength(31);
    expect(result.payloadObjectsDeleted).toEqual(expect.arrayContaining([
      `${RELEASES_PREFIX}${old.releaseId}/artifacts/highlights/rolling30.json.gz`,
      `${RELEASES_PREFIX}${old.releaseId}/artifacts/market-live/rolling30.json.gz`,
    ]));
  });

  it('records completion only after an empty exact-prefix list and paced management HEADs converge', async () => {
    const { fixture, plan, old } = await deletablePlan();
    const firstExpectedPathname = old.objects[0].pathname;
    fixture.headRetentionObject.mockResolvedValueOnce({ ...old.objects[0] });
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    const result = await executePublicSnapshotRetention(fixture.store, plan, {
      maxConvergenceAttempts: 2,
      sleep,
    });

    expect(result.completedReleaseIds).toEqual([old.releaseId]);
    expect(fixture.headRetentionObject.mock.calls[0]?.[0]).toBe(firstExpectedPathname);
    expect(fixture.listRetentionObjects.mock.calls.filter(
      ([input]) => input.prefix === `${RELEASES_PREFIX}${old.releaseId}/`,
    )).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(sleep.mock.calls.filter(([milliseconds]) => milliseconds === 100)).toHaveLength(29);
  });

  it('fails closed after delete acceptance when management convergence times out', async () => {
    const { fixture, plan, old } = await deletablePlan();
    fixture.headRetentionObject.mockImplementation(async (pathname: string) => {
      const object = old.objects.find((entry) => entry.pathname === pathname);
      return object ? { ...object } : null;
    });
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    let failure: unknown;
    try {
      await executePublicSnapshotRetention(fixture.store, plan, {
        maxConvergenceAttempts: 2,
        sleep,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(PublicSnapshotRetentionExecutionError);
    expect(failure).toMatchObject({
      message: `Retention delete was accepted but convergence remains unverified for release ${old.releaseId}`,
      result: {
        manifestTombstones: [`${RELEASES_PREFIX}${old.releaseId}/manifest.json`],
        payloadObjectsDeleted: old.objects
          .filter(({ pathname }) => !pathname.endsWith('/manifest.json'))
          .map(({ pathname }) => pathname),
        completedReleaseIds: [],
      },
    });
    expect(sleep.mock.calls.filter(([milliseconds]) => milliseconds === 2_000)).toHaveLength(1);
  });

  it('fails closed on paginated unknown residue without exposing management details', async () => {
    const { fixture, plan, old } = await deletablePlan();
    const exactPrefix = `${RELEASES_PREFIX}${old.releaseId}/`;
    const normalList = fixture.listRetentionObjects.getMockImplementation()!;
    fixture.listRetentionObjects.mockImplementation(async (input) => {
      if (input.prefix !== exactPrefix) return normalList(input);
      if (!input.cursor) {
        return {
          objects: [{
            pathname: `${exactPrefix}shards/00.json.gz`,
            size: 1,
            uploadedAt: OLD_UPLOAD,
            etag: 'stale-known-object',
          }],
          hasMore: true,
          cursor: 'private-management-cursor',
        };
      }
      return {
        objects: [{
          pathname: `${exactPrefix}unknown-private-object.bin`,
          size: 1,
          uploadedAt: OLD_UPLOAD,
          etag: 'private-management-etag',
        }],
        hasMore: false,
        cursor: null,
      };
    });

    let failure: unknown;
    try {
      await executePublicSnapshotRetention(fixture.store, plan, {
        sleep: async () => undefined,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      message: `Retention delete was accepted but convergence remains unverified for release ${old.releaseId}`,
      result: { completedReleaseIds: [] },
    });
    expect((failure as Error).message).not.toContain('private-management');
    expect(fixture.listRetentionObjects.mock.calls.filter(
      ([input]) => input.prefix === exactPrefix,
    )).toHaveLength(2);
  });

  it('aborts before mutation when discovery changed after planning', async () => {
    const { fixture, plan } = await deletablePlan();
    fixture.headRetentionDiscovery.mockResolvedValue({
      ...fixture.discoveryHead!,
      etag: 'changed',
    });

    await expect(executePublicSnapshotRetention(fixture.store, plan, {
      sleep: async () => undefined,
    })).rejects.toMatchObject({
      name: 'PublicSnapshotRetentionExecutionError',
      result: { completedReleaseIds: [], manifestTombstones: [] },
    });
    expect(fixture.deleteRetentionManifest).not.toHaveBeenCalled();
    expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('rejects convergence HEAD pacing below the management-operation safety floor', async () => {
    const { fixture, plan } = await deletablePlan();

    await expect(executePublicSnapshotRetention(fixture.store, plan, {
      convergenceHeadDelayMs: 99,
      sleep: async () => undefined,
    })).rejects.toThrow('convergence HEAD delay must be at least 100ms');
    expect(fixture.deleteRetentionManifest).not.toHaveBeenCalled();
    expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('retries payload batches boundedly, reports a tombstoned partial release, and stops', async () => {
    const { fixture, plan, old } = await deletablePlan();
    fixture.deleteRetentionObjects.mockRejectedValue(new Error('sensitive SDK error'));
    const sleep = vi.fn(async (_milliseconds: number) => undefined);

    let failure: unknown;
    try {
      await executePublicSnapshotRetention(fixture.store, plan, { sleep });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(PublicSnapshotRetentionExecutionError);
    expect(failure).toMatchObject({
      message: `Retention execution stopped while processing release ${old.releaseId}`,
      result: {
        manifestTombstones: [`${RELEASES_PREFIX}${old.releaseId}/manifest.json`],
        payloadObjectsDeleted: [],
        completedReleaseIds: [],
      },
    });
    expect(fixture.deleteRetentionObjects).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([1_000, 2_000]);
  });

  it('waits between releases before re-HEAD and the next tombstone', async () => {
    const current = makeRelease(
      releaseId('20260812T000000Z', 'f'),
      '2026-08-12T00:00:00.000Z',
      '2026-08-12T00:01:00.000Z',
    );
    const rollback = makeRelease(
      releaseId('20260401T000000Z', 'e'),
      '2026-04-01T00:00:00.000Z',
    );
    const oldOne = makeRelease(
      releaseId('20260101T000000Z', 'c'),
      '2026-01-01T00:00:00.000Z',
    );
    const oldTwo = makeRelease(
      releaseId('20260201T000000Z', 'd'),
      '2026-02-01T00:00:00.000Z',
    );
    const fixture = createStore({ releases: [current, rollback, oldOne, oldTwo], current });
    const plan = await collectAndPlanPublicSnapshotRetention(fixture.store, {
      now: NOW,
      keepCompleteReleaseCount: 2,
    });
    const events: string[] = [];
    fixture.headRetentionDiscovery.mockImplementation(async () => {
      events.push('head');
      return fixture.discoveryHead;
    });
    const deleteManifest = fixture.deleteRetentionManifest.getMockImplementation()!;
    fixture.deleteRetentionManifest.mockImplementation(async (pathname: string, etag: string) => {
      events.push(`manifest:${pathname}`);
      await deleteManifest(pathname, etag);
    });
    const sleep = vi.fn(async (_milliseconds: number) => {
      events.push('sleep');
    });

    await executePublicSnapshotRetention(fixture.store, plan, { sleep });
    const secondManifestIndex = events.findIndex((event) => event.includes(oldTwo.releaseId));
    expect(secondManifestIndex).toBeGreaterThan(0);
    expect(events.slice(0, secondManifestIndex).at(-2)).toBe('sleep');
    expect(events.slice(0, secondManifestIndex).at(-1)).toBe('head');
    expect(sleep.mock.calls.filter(([milliseconds]) => milliseconds === 1_000)).toHaveLength(5);
    expect(sleep.mock.calls.filter(([milliseconds]) => milliseconds === 100)).toHaveLength(58);
  });

  it('rejects a runtime-tampered plan before any delete', async () => {
    const { fixture, plan } = await deletablePlan();
    const tampered: PublicSnapshotRetentionPlan = {
      ...plan,
      deleteCandidates: [{
        ...plan.deleteCandidates[0],
        payloadPathnames: ['/outside/private.dump'],
      }],
    };

    await expect(executePublicSnapshotRetention(fixture.store, tampered, {
      sleep: async () => undefined,
    })).rejects.toThrow('unknown or malformed');
    expect(fixture.deleteRetentionManifest).not.toHaveBeenCalled();
    expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('rejects a runtime-tampered six-artifact complete release before any delete', async () => {
    const { fixture, plan } = await deletablePlan(CURRENT_ARTIFACT_NAMES);
    const candidate = plan.deleteCandidates[0];
    const payloadPathnames = candidate.payloadPathnames.filter(
      (pathname) => !pathname.endsWith('/artifacts/market-live/rolling30.json.gz'),
    );
    const tampered: PublicSnapshotRetentionPlan = {
      ...plan,
      deleteCandidates: [{
        ...candidate,
        payloadPathnames,
        objectCount: payloadPathnames.length + 1,
      }],
    };

    await expect(executePublicSnapshotRetention(fixture.store, tampered, {
      sleep: async () => undefined,
    })).rejects.toThrow('manifest tombstone');
    expect(fixture.deleteRetentionManifest).not.toHaveBeenCalled();
    expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });

  it('binds CLI-facing current fields and candidate counts to the discovery guard', async () => {
    const { fixture, plan } = await deletablePlan();
    const mismatchedCurrent: PublicSnapshotRetentionPlan = {
      ...plan,
      currentReleaseId: releaseId('20260101T000000Z', 'a'),
    };
    await expect(executePublicSnapshotRetention(fixture.store, mismatchedCurrent, {
      sleep: async () => undefined,
    })).rejects.toThrow('discovery guard');

    const mismatchedCount: PublicSnapshotRetentionPlan = {
      ...plan,
      deleteCandidates: [{
        ...plan.deleteCandidates[0],
        objectCount: 1,
      }],
    };
    await expect(executePublicSnapshotRetention(fixture.store, mismatchedCount, {
      sleep: async () => undefined,
    })).rejects.toThrow('manifest tombstone');
    expect(fixture.deleteRetentionManifest).not.toHaveBeenCalled();
    expect(fixture.deleteRetentionObjects).not.toHaveBeenCalled();
  });
});
