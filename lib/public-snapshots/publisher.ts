import type {
  PublicNamedArtifactEntry,
  PublicNamedArtifactEnvelope,
  PublicSnapshotCounts,
  PublicSnapshotDistrictEntry,
  PublicSnapshotShardDescriptor,
  PublicSnapshotShardEntry,
  PublicTransactionShard,
  PublicTransactionManifest,
  PublicTransactionSnapshot,
} from './contract';
import {
  PUBLIC_TRANSACTION_DISTRICT_COUNT,
  PUBLIC_TRANSACTION_MANIFEST_SCHEMA,
  PUBLIC_TRANSACTION_SHARD_COUNT,
  PUBLIC_TRANSACTION_SHARD_SCHEMA,
  PUBLIC_TRANSACTION_SNAPSHOT_PREFIX,
  PublicSnapshotValidationError,
  assertPublicTransactionManifest,
  assertPublicTransactionShard,
  assertPublicTransactionShardMatchesManifest,
  assertPublicTransactionSnapshot,
  countPublicTransactions,
  latestPublicDealDate,
} from './contract';
import {
  decodeAndValidatePublicNamedArtifact,
  decodeAndValidatePublicTransactionShard,
  encodePublicJsonArtifact,
  encodePublicTransactionShard,
  sha256Hex,
  stableJson,
} from './artifact';
import type { PublicSnapshotObjectStore, PublicSnapshotPutResult } from './object-store';

export const PUBLIC_TRANSACTION_MANIFEST_KEY = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;

export interface PublicNamedArtifactInput<T = unknown> {
  name: string;
  schema: string;
  itemCount: number;
  data: T;
}

export interface PublishPublicSnapshotReleaseInput {
  snapshots: readonly PublicTransactionSnapshot[];
  namedArtifacts?: readonly PublicNamedArtifactInput[];
  store: PublicSnapshotObjectStore;
  publishedAt?: string;
}

export interface PublishPublicSnapshotReleaseResult {
  releaseId: string;
  manifest: PublicTransactionManifest;
  manifestKey: typeof PUBLIC_TRANSACTION_MANIFEST_KEY;
  releaseManifestKey: string;
  uploads: PublicSnapshotPutResult[];
}

const FORBIDDEN_FIELD_NAMES = new Set([
  'accesstoken', 'apikey', 'authorization', 'buyername', 'connectionstring',
  'cookie', 'credential', 'credentials', 'databaseurl', 'email', 'ip', 'ipaddress',
  'jibun', 'ownerid', 'ownername', 'password', 'phone', 'phonenumber',
  'refreshtoken', 'residentnumber', 'sellername', 'session', 'sessionid', 'secret',
  'token', 'userid',
]);

function assertPublicJsonValue(value: unknown, path = 'data', depth = 0): void {
  if (depth > 30) throw new PublicSnapshotValidationError('named artifact', [`${path} is too deeply nested`]);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new PublicSnapshotValidationError('named artifact', [`${path} is not finite`]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertPublicJsonValue(child, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new PublicSnapshotValidationError('named artifact', [`${path} is not plain JSON`]);
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    if (FORBIDDEN_FIELD_NAMES.has(normalized)) {
      throw new PublicSnapshotValidationError('named artifact', [`${path}.${key} is forbidden in public output`]);
    }
    assertPublicJsonValue(child, `${path}.${key}`, depth + 1);
  }
}

function releaseTimestamp(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match || !Number.isFinite(Date.parse(iso))) {
    throw new PublicSnapshotValidationError('release', ['publishedAt must be an ISO timestamp']);
  }
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}Z`;
}

function addCounts(target: PublicSnapshotCounts, counts: PublicSnapshotCounts): void {
  target.total += counts.total;
  target.sale += counts.sale;
  target.rent += counts.rent;
  target.presale += counts.presale;
}

function shardObjectKey(releaseId: string, shardId: string): string {
  return `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/shards/${shardId}.json.gz`;
}

function namedArtifactObjectKey(releaseId: string, name: string): string {
  return `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/artifacts/${name}.json.gz`;
}

export function publicTransactionReleaseManifestKey(releaseId: string): string {
  return `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/manifest.json`;
}

interface ShardBin {
  shardId: string;
  estimatedPayloadBytes: number;
  snapshots: PublicTransactionSnapshot[];
}

/**
 * Stable largest-first greedy packing. Raw canonical JSON bytes are used as the
 * weight so assignment cannot vary with compression-library implementation.
 */
export function buildPublicTransactionShards(
  snapshots: readonly PublicTransactionSnapshot[],
  publishedAt: string,
): PublicTransactionShard[] {
  if (snapshots.length !== PUBLIC_TRANSACTION_DISTRICT_COUNT) {
    throw new PublicSnapshotValidationError('release', [
      `exactly ${PUBLIC_TRANSACTION_DISTRICT_COUNT} district snapshots are required`,
    ]);
  }
  const seenLawdCodes = new Set<string>();
  const weighted = snapshots.map((snapshot) => {
    assertPublicTransactionSnapshot(snapshot);
    if (snapshot.generatedAt !== publishedAt) {
      throw new PublicSnapshotValidationError('release', [
        `snapshot generatedAt must match publishedAt: ${snapshot.partition.lawdCd}`,
      ]);
    }
    if (seenLawdCodes.has(snapshot.partition.lawdCd)) {
      throw new PublicSnapshotValidationError('release', [`duplicate district: ${snapshot.partition.lawdCd}`]);
    }
    seenLawdCodes.add(snapshot.partition.lawdCd);
    return {
      snapshot,
      estimatedPayloadBytes: Buffer.byteLength(stableJson(snapshot), 'utf8'),
    };
  }).sort((left, right) =>
    right.estimatedPayloadBytes - left.estimatedPayloadBytes
      || left.snapshot.partition.lawdCd.localeCompare(right.snapshot.partition.lawdCd));

  const bins: ShardBin[] = Array.from({ length: PUBLIC_TRANSACTION_SHARD_COUNT }, (_, index) => ({
    shardId: String(index).padStart(2, '0'),
    estimatedPayloadBytes: 0,
    snapshots: [],
  }));
  for (const candidate of weighted) {
    let target = bins[0];
    for (const bin of bins.slice(1)) {
      if (bin.estimatedPayloadBytes < target.estimatedPayloadBytes
        || (bin.estimatedPayloadBytes === target.estimatedPayloadBytes
          && bin.shardId < target.shardId)) {
        target = bin;
      }
    }
    target.snapshots.push(candidate.snapshot);
    target.estimatedPayloadBytes += candidate.estimatedPayloadBytes;
  }

  return bins.map((bin) => {
    const sortedSnapshots = [...bin.snapshots]
      .sort((left, right) => left.partition.lawdCd.localeCompare(right.partition.lawdCd));
    const shard: PublicTransactionShard = {
      schema: PUBLIC_TRANSACTION_SHARD_SCHEMA,
      generatedAt: publishedAt,
      shardId: bin.shardId,
      snapshotCount: sortedSnapshots.length,
      recordCount: sortedSnapshots.reduce((total, snapshot) => total + snapshot.recordCount, 0),
      snapshots: sortedSnapshots,
    };
    assertPublicTransactionShard(shard);
    return shard;
  });
}

export async function publishPublicSnapshotRelease(
  input: PublishPublicSnapshotReleaseInput,
): Promise<PublishPublicSnapshotReleaseResult> {
  const publishedAt = input.publishedAt ?? new Date().toISOString();
  const timestamp = releaseTimestamp(publishedAt);
  const encodedShards = buildPublicTransactionShards(input.snapshots, publishedAt)
    .map(encodePublicTransactionShard);

  const namedInputs = [...(input.namedArtifacts ?? [])]
    .sort((left, right) => left.name.localeCompare(right.name));
  const seenNames = new Set<string>();
  const encodedNamed = namedInputs.map((artifact) => {
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(artifact.name) || artifact.name.includes('..')) {
      throw new PublicSnapshotValidationError('named artifact', [`invalid name: ${artifact.name}`]);
    }
    if (seenNames.has(artifact.name)) {
      throw new PublicSnapshotValidationError('named artifact', [`duplicate name: ${artifact.name}`]);
    }
    seenNames.add(artifact.name);
    if (!/^naezip\.[a-z0-9.-]+\.v\d+$/.test(artifact.schema)) {
      throw new PublicSnapshotValidationError('named artifact', [`invalid schema: ${artifact.schema}`]);
    }
    if (!Number.isSafeInteger(artifact.itemCount) || artifact.itemCount < 0) {
      throw new PublicSnapshotValidationError('named artifact', [`invalid itemCount for ${artifact.name}`]);
    }
    if (Array.isArray(artifact.data) && artifact.data.length !== artifact.itemCount) {
      throw new PublicSnapshotValidationError('named artifact', [`itemCount does not match data.length for ${artifact.name}`]);
    }
    assertPublicJsonValue(artifact.data);
    const envelope: PublicNamedArtifactEnvelope = {
      schema: artifact.schema,
      generatedAt: publishedAt,
      itemCount: artifact.itemCount,
      data: artifact.data,
    };
    return { input: artifact, encoded: encodePublicJsonArtifact(envelope) };
  });

  const releaseDigest = sha256Hex(stableJson({
    publishedAt,
    shards: encodedShards.map((artifact) => ({
      shardId: artifact.shard.shardId,
      sha256: artifact.sha256,
    })),
    namedArtifacts: encodedNamed.map(({ input: artifact, encoded }) => ({
      name: artifact.name,
      sha256: encoded.sha256,
    })),
  })).slice(0, 12);
  const releaseId = `${timestamp}-${releaseDigest}`;
  const uploads: PublicSnapshotPutResult[] = [];
  const districts: PublicSnapshotDistrictEntry[] = [];
  const totals: PublicSnapshotCounts = { total: 0, sale: 0, rent: 0, presale: 0 };
  const shards: PublicSnapshotShardEntry[] = encodedShards.map((artifact) => {
    const key = shardObjectKey(releaseId, artifact.shard.shardId);
    const descriptor: PublicSnapshotShardDescriptor = {
      key,
      schema: PUBLIC_TRANSACTION_SHARD_SCHEMA,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      sha256: artifact.sha256,
      payloadSha256: artifact.payloadSha256,
      byteLength: artifact.byteLength,
      payloadByteLength: artifact.payloadByteLength,
    };
    const entry: PublicSnapshotShardEntry = {
      shardId: artifact.shard.shardId,
      districtCount: artifact.shard.snapshotCount,
      recordCount: artifact.shard.recordCount,
      shard: descriptor,
    };
    decodeAndValidatePublicTransactionShard(artifact.body, descriptor, entry);
    for (const snapshot of artifact.shard.snapshots) {
      const counts = countPublicTransactions(snapshot.records);
      addCounts(totals, counts);
      districts.push({
        lawdCd: snapshot.partition.lawdCd,
        district: snapshot.partition.district,
        period: { ...snapshot.period },
        counts,
        latestDealDate: latestPublicDealDate(snapshot.records),
        shardId: artifact.shard.shardId,
      });
    }
    return entry;
  });
  districts.sort((left, right) => left.lawdCd.localeCompare(right.lawdCd));

  const namedObjects = encodedNamed.map(({ input: artifact, encoded }) => {
    const key = namedArtifactObjectKey(releaseId, artifact.name);
    const descriptor = {
      key,
      schema: artifact.schema,
      itemCount: artifact.itemCount,
      contentType: 'application/json' as const,
      contentEncoding: 'gzip' as const,
      sha256: encoded.sha256,
      payloadSha256: encoded.payloadSha256,
      byteLength: encoded.byteLength,
      payloadByteLength: encoded.payloadByteLength,
    };
    decodeAndValidatePublicNamedArtifact(encoded.body, descriptor);
    const entry: PublicNamedArtifactEntry = { name: artifact.name, artifact: descriptor };
    return { body: encoded.body, descriptor, entry };
  });
  const namedArtifacts = namedObjects.map(({ entry }) => entry);

  const manifest: PublicTransactionManifest = {
    schema: PUBLIC_TRANSACTION_MANIFEST_SCHEMA,
    releaseId,
    publishedAt,
    source: {
      provider: 'molit-open-data',
      format: 'normalized-public-records',
      containsPersonalData: false,
    },
    totals,
    shards,
    districts,
    namedArtifacts,
  };
  assertPublicTransactionManifest(manifest);
  for (const artifact of encodedShards) {
    assertPublicTransactionShardMatchesManifest(artifact.shard, manifest);
  }
  const manifestBody = Buffer.from(stableJson(manifest), 'utf8');
  const manifestSha256 = sha256Hex(manifestBody);

  // Every body/descriptor/mapping was validated above, before the first PUT.
  for (let index = 0; index < encodedShards.length; index += 1) {
    const artifact = encodedShards[index];
    const descriptor = shards[index].shard;
    uploads.push(await input.store.putObject({
      key: descriptor.key,
      body: artifact.body,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      cacheControl: 'public, max-age=31536000, immutable',
      sha256: artifact.sha256,
      immutable: true,
    }));
  }
  for (const { body, descriptor } of namedObjects) {
    uploads.push(await input.store.putObject({
      key: descriptor.key,
      body,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      cacheControl: 'public, max-age=31536000, immutable',
      sha256: descriptor.sha256,
      immutable: true,
    }));
  }

  // First preserve an immutable release manifest for rollback/audit.
  const releaseManifestKey = publicTransactionReleaseManifestKey(releaseId);
  uploads.push(await input.store.putObject({
    key: releaseManifestKey,
    body: manifestBody,
    contentType: 'application/json',
    cacheControl: 'public, max-age=31536000, immutable',
    sha256: manifestSha256,
    immutable: true,
  }));

  // Atomic publication boundary: the mutable discovery manifest is last.
  uploads.push(await input.store.putObject({
    key: PUBLIC_TRANSACTION_MANIFEST_KEY,
    body: manifestBody,
    contentType: 'application/json',
    cacheControl: 'public, max-age=60, must-revalidate',
    sha256: manifestSha256,
    immutable: false,
  }));

  return {
    releaseId,
    manifest,
    manifestKey: PUBLIC_TRANSACTION_MANIFEST_KEY,
    releaseManifestKey,
    uploads,
  };
}
