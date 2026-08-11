import type {
  PublicNamedArtifactEntry,
  PublicNamedArtifactEnvelope,
  PublicSnapshotCounts,
  PublicSnapshotDistrictEntry,
  PublicSnapshotObjectDescriptor,
  PublicTransactionManifest,
  PublicTransactionSnapshot,
} from './contract';
import {
  PUBLIC_TRANSACTION_MANIFEST_SCHEMA,
  PUBLIC_TRANSACTION_SNAPSHOT_PREFIX,
  PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA,
  PublicSnapshotValidationError,
  assertPublicTransactionManifest,
  assertPublicTransactionSnapshot,
  countPublicTransactions,
  latestPublicDealDate,
} from './contract';
import {
  decodeAndValidatePublicNamedArtifact,
  decodeAndValidatePublicSnapshot,
  encodePublicJsonArtifact,
  encodePublicTransactionSnapshot,
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

function snapshotObjectKey(releaseId: string, lawdCd: string): string {
  return `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/districts/${lawdCd}.json.gz`;
}

function namedArtifactObjectKey(releaseId: string, name: string): string {
  return `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/artifacts/${name}.json.gz`;
}

export function publicTransactionReleaseManifestKey(releaseId: string): string {
  return `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/${releaseId}/manifest.json`;
}

export async function publishPublicSnapshotRelease(
  input: PublishPublicSnapshotReleaseInput,
): Promise<PublishPublicSnapshotReleaseResult> {
  if (input.snapshots.length === 0) {
    throw new PublicSnapshotValidationError('release', ['at least one district snapshot is required']);
  }
  const publishedAt = input.publishedAt ?? new Date().toISOString();
  const timestamp = releaseTimestamp(publishedAt);

  const seenLawdCodes = new Set<string>();
  const encodedSnapshots = [...input.snapshots]
    .sort((left, right) => left.partition.lawdCd.localeCompare(right.partition.lawdCd))
    .map((snapshot) => {
      assertPublicTransactionSnapshot(snapshot);
      if (seenLawdCodes.has(snapshot.partition.lawdCd)) {
        throw new PublicSnapshotValidationError('release', [`duplicate district: ${snapshot.partition.lawdCd}`]);
      }
      seenLawdCodes.add(snapshot.partition.lawdCd);
      return encodePublicTransactionSnapshot(snapshot);
    });

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
    snapshots: encodedSnapshots.map((artifact) => ({
      lawdCd: artifact.snapshot.partition.lawdCd,
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

  // Upload every immutable district object before creating either manifest.
  for (const artifact of encodedSnapshots) {
    const key = snapshotObjectKey(releaseId, artifact.snapshot.partition.lawdCd);
    const descriptor: PublicSnapshotObjectDescriptor = {
      key,
      schema: PUBLIC_TRANSACTION_SNAPSHOT_SCHEMA,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      sha256: artifact.sha256,
      payloadSha256: artifact.payloadSha256,
      byteLength: artifact.byteLength,
      payloadByteLength: artifact.payloadByteLength,
    };
    decodeAndValidatePublicSnapshot(artifact.body, descriptor, artifact.snapshot.recordCount);
    uploads.push(await input.store.putObject({
      key,
      body: artifact.body,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      cacheControl: 'public, max-age=31536000, immutable',
      sha256: artifact.sha256,
      immutable: true,
    }));
    const counts = countPublicTransactions(artifact.snapshot.records);
    addCounts(totals, counts);
    districts.push({
      lawdCd: artifact.snapshot.partition.lawdCd,
      district: artifact.snapshot.partition.district,
      period: { ...artifact.snapshot.period },
      counts,
      latestDealDate: latestPublicDealDate(artifact.snapshot.records),
      snapshot: descriptor,
    });
  }

  const namedArtifacts: PublicNamedArtifactEntry[] = [];
  for (const { input: artifact, encoded } of encodedNamed) {
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
    uploads.push(await input.store.putObject({
      key,
      body: encoded.body,
      contentType: 'application/json',
      contentEncoding: 'gzip',
      cacheControl: 'public, max-age=31536000, immutable',
      sha256: encoded.sha256,
      immutable: true,
    }));
    namedArtifacts.push({ name: artifact.name, artifact: descriptor });
  }

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
    districts,
    namedArtifacts,
  };
  assertPublicTransactionManifest(manifest);
  const manifestBody = Buffer.from(stableJson(manifest), 'utf8');
  const manifestSha256 = sha256Hex(manifestBody);

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
