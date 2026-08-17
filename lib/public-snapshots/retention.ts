import {
  PUBLIC_TRANSACTION_SHARD_COUNT,
  PUBLIC_TRANSACTION_SNAPSHOT_PREFIX,
  assertPublicTransactionManifest,
  type PublicTransactionManifest,
} from './contract';
import type {
  PublicSnapshotRetentionDiscoveryHead,
  PublicSnapshotRetentionListedObject,
  PublicSnapshotRetentionObjectHead,
  PublicSnapshotRetentionObjectStore,
  PublicSnapshotRetentionReadResult,
} from './object-store';

export const PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA = 'naezip.public-snapshot-retention-plan.v1' as const;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_KEEP_COUNT = 30;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_KEEP_DAYS = 30;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_ORPHAN_GRACE_HOURS = 72;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_LIST_LIMIT = 1_000;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_PAGES = 20;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_OBJECTS = 10_000;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_DELETE_BATCH_SIZE = 10;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_DELETE_DELAY_MS = 1_000;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_DELETE_ATTEMPTS = 3;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_ATTEMPTS = 6;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_DELAY_MS = 2_000;
export const PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_HEAD_DELAY_MS = 100;

const MAX_MANIFEST_BYTES = 10 * 1024 * 1024;
const RELEASES_PREFIX = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/releases/`;
const DISCOVERY_PATHNAME = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
const RELEASE_ID_SOURCE = '(\\d{8}T\\d{6}Z-[a-f0-9]{12})';
const RELEASE_MANIFEST_PATTERN = new RegExp(`^${RELEASES_PREFIX}${RELEASE_ID_SOURCE}/manifest\\.json$`);
const RELEASE_SHARD_PATTERN = new RegExp(
  `^${RELEASES_PREFIX}${RELEASE_ID_SOURCE}/shards/(0\\d|1\\d|2[0-3])\\.json\\.gz$`,
);
const RELEASE_ARTIFACT_PATTERN = new RegExp(
  `^${RELEASES_PREFIX}${RELEASE_ID_SOURCE}/artifacts/(`
    + 'apartment-index|highlights/rolling30|market-live/rolling30'
    + '|summary/rolling30/(?:buy|jeonse|monthly|bunyang)'
    + ')\\.json\\.gz$',
);
const RELEASE_ID_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;
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
const SUPPORTED_ARTIFACT_NAME_SETS: readonly (readonly string[])[] = [
  LEGACY_ARTIFACT_NAMES,
  CURRENT_ARTIFACT_NAMES,
];

function isExactSupportedArtifactSet(names: readonly string[]): boolean {
  const actual = new Set(names);
  return actual.size === names.length && SUPPORTED_ARTIFACT_NAME_SETS.some(
    (expected) => actual.size === expected.length && expected.every((name) => actual.has(name)),
  );
}

function hasExactCompletePayloadSet(releaseId: string, pathnames: readonly string[]): boolean {
  const actual = new Set(pathnames);
  if (actual.size !== pathnames.length) return false;
  return SUPPORTED_ARTIFACT_NAME_SETS.some((artifactNames) => {
    if (actual.size !== PUBLIC_TRANSACTION_SHARD_COUNT + artifactNames.length) return false;
    for (let index = 0; index < PUBLIC_TRANSACTION_SHARD_COUNT; index += 1) {
      const shardId = String(index).padStart(2, '0');
      if (!actual.has(`${RELEASES_PREFIX}${releaseId}/shards/${shardId}.json.gz`)) return false;
    }
    return artifactNames.every(
      (name) => actual.has(`${RELEASES_PREFIX}${releaseId}/artifacts/${name}.json.gz`),
    );
  });
}

export class PublicSnapshotRetentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicSnapshotRetentionError';
  }
}

export interface PublicSnapshotRetentionPolicy {
  now?: Date;
  keepCompleteReleaseCount?: number;
  keepCompleteReleaseDays?: number;
  orphanGraceHours?: number;
  listLimit?: number;
  maxPages?: number;
  maxObjects?: number;
}

export interface PublicSnapshotRetentionDiscoveryState {
  releaseId: string;
  etag: string;
  size: number;
  uploadedAt: string;
}

export interface PublicSnapshotRetentionDeleteCandidate {
  releaseId: string;
  kind: 'complete-release' | 'orphan-payloads';
  manifestPathname: string | null;
  manifestEtag: string | null;
  publishedAt: string | null;
  payloadPathnames: readonly string[];
  objectCount: number;
  byteLength: number;
}

export interface PublicSnapshotRetentionPlan {
  schema: typeof PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA;
  plannedAt: string;
  inventoryObjectCount: number;
  inventoryByteLength: number;
  currentReleaseId: string | null;
  currentDiscoveryEtag: string | null;
  discovery: PublicSnapshotRetentionDiscoveryState | null;
  protectedReleaseIds: readonly string[];
  deleteCandidates: readonly PublicSnapshotRetentionDeleteCandidate[];
}

export interface PublicSnapshotRetentionExecutionResult {
  manifestTombstones: readonly string[];
  payloadObjectsDeleted: readonly string[];
  completedReleaseIds: readonly string[];
}

export class PublicSnapshotRetentionExecutionError extends PublicSnapshotRetentionError {
  readonly result: PublicSnapshotRetentionExecutionResult;

  constructor(message: string, result: PublicSnapshotRetentionExecutionResult) {
    super(message);
    this.name = 'PublicSnapshotRetentionExecutionError';
    this.result = result;
  }
}

export interface PublicSnapshotRetentionExecutionOptions {
  batchSize?: number;
  batchDelayMs?: number;
  maxPayloadDeleteAttempts?: number;
  maxConvergenceAttempts?: number;
  convergenceDelayMs?: number;
  convergenceHeadDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

interface ParsedRetentionPath {
  releaseId: string;
  kind: 'manifest' | 'payload';
}

interface ReleaseInventory {
  releaseId: string;
  objects: PublicSnapshotRetentionListedObject[];
  manifestObject: PublicSnapshotRetentionListedObject | null;
  payloadObjects: PublicSnapshotRetentionListedObject[];
}

interface CompleteRelease {
  releaseId: string;
  manifest: PublicTransactionManifest;
  manifestBody: Uint8Array;
  manifestObject: PublicSnapshotRetentionListedObject;
  payloadObjects: PublicSnapshotRetentionListedObject[];
  objects: PublicSnapshotRetentionListedObject[];
}

function assertPositiveInteger(value: number, label: string, maximum = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new PublicSnapshotRetentionError(`${label} is invalid`);
  }
}

function finiteTimestamp(value: string, label: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new PublicSnapshotRetentionError(`${label} is invalid`);
  return timestamp;
}

function parseRetentionPath(pathname: string): ParsedRetentionPath {
  const manifestMatch = pathname.match(RELEASE_MANIFEST_PATTERN);
  if (manifestMatch) return { releaseId: manifestMatch[1], kind: 'manifest' };
  const shardMatch = pathname.match(RELEASE_SHARD_PATTERN);
  if (shardMatch) return { releaseId: shardMatch[1], kind: 'payload' };
  const artifactMatch = pathname.match(RELEASE_ARTIFACT_PATTERN);
  if (artifactMatch) return { releaseId: artifactMatch[1], kind: 'payload' };
  throw new PublicSnapshotRetentionError('Retention inventory contains an unknown or malformed v2 release pathname');
}

function assertListedObject(object: PublicSnapshotRetentionListedObject): void {
  if (typeof object.pathname !== 'string'
    || !Number.isSafeInteger(object.size)
    || object.size < 1
    || typeof object.etag !== 'string'
    || !object.etag.trim()) {
    throw new PublicSnapshotRetentionError('Retention inventory contains invalid object metadata');
  }
  finiteTimestamp(object.uploadedAt, 'Retention inventory uploadedAt');
  parseRetentionPath(object.pathname);
}

async function listAllRetentionObjects(
  store: PublicSnapshotRetentionObjectStore,
  policy: Required<Pick<PublicSnapshotRetentionPolicy, 'listLimit' | 'maxPages' | 'maxObjects'>>,
  prefix = RELEASES_PREFIX,
  expectedReleaseId?: string,
): Promise<PublicSnapshotRetentionListedObject[]> {
  assertPositiveInteger(policy.listLimit, 'Retention list limit', 1_000);
  assertPositiveInteger(policy.maxPages, 'Retention maximum page count', 10_000);
  assertPositiveInteger(policy.maxObjects, 'Retention maximum object count', 1_000_000);

  const objects: PublicSnapshotRetentionListedObject[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let previousPathname: string | null = null;

  for (let pageNumber = 1; ; pageNumber += 1) {
    if (pageNumber > policy.maxPages) {
      throw new PublicSnapshotRetentionError('Retention inventory exceeded the maximum page count');
    }
    const page = await store.listRetentionObjects({
      prefix,
      limit: policy.listLimit,
      ...(cursor ? { cursor } : {}),
    });
    if (!page || !Array.isArray(page.objects) || typeof page.hasMore !== 'boolean') {
      throw new PublicSnapshotRetentionError('Retention list returned invalid pagination metadata');
    }
    if (page.objects.length > policy.listLimit) {
      throw new PublicSnapshotRetentionError('Retention list returned more objects than requested');
    }
    for (const object of page.objects) {
      assertListedObject(object);
      if (!object.pathname.startsWith(prefix)
        || (expectedReleaseId && parseRetentionPath(object.pathname).releaseId !== expectedReleaseId)) {
        throw new PublicSnapshotRetentionError('Retention list escaped the requested release prefix');
      }
      if (previousPathname !== null && object.pathname <= previousPathname) {
        throw new PublicSnapshotRetentionError(
          'Retention inventory pathnames must be unique and strictly lexicographically ordered',
        );
      }
      previousPathname = object.pathname;
      objects.push({ ...object });
      if (objects.length > policy.maxObjects) {
        throw new PublicSnapshotRetentionError('Retention inventory exceeded the maximum object count');
      }
    }
    if (!page.hasMore) {
      if (page.cursor !== null) {
        throw new PublicSnapshotRetentionError('Retention list returned an unexpected final cursor');
      }
      break;
    }
    if (typeof page.cursor !== 'string' || !page.cursor.trim() || cursors.has(page.cursor)) {
      throw new PublicSnapshotRetentionError('Retention list returned a missing or repeated cursor');
    }
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
  return objects;
}

function assertReleaseObjectHead(
  head: PublicSnapshotRetentionObjectHead,
  expectedPathname: string,
): void {
  if (head.pathname !== expectedPathname
    || typeof head.etag !== 'string'
    || !head.etag.trim()
    || !Number.isSafeInteger(head.size)
    || head.size < 1) {
    throw new PublicSnapshotRetentionError('Release convergence HEAD returned invalid metadata');
  }
  finiteTimestamp(head.uploadedAt, 'Release convergence HEAD uploadedAt');
}

async function waitForReleaseDeletionConvergence(input: {
  store: PublicSnapshotRetentionObjectStore;
  candidate: PublicSnapshotRetentionDeleteCandidate;
  maxAttempts: number;
  delayMs: number;
  headDelayMs: number;
  sleep: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  const releasePrefix = `${RELEASES_PREFIX}${input.candidate.releaseId}/`;
  const expectedPathnames = [
    ...(input.candidate.manifestPathname ? [input.candidate.manifestPathname] : []),
    ...input.candidate.payloadPathnames,
  ].sort();

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    const listed = await listAllRetentionObjects(input.store, {
      listLimit: PUBLIC_SNAPSHOT_RETENTION_DEFAULT_LIST_LIMIT,
      maxPages: PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_PAGES,
      maxObjects: PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_OBJECTS,
    }, releasePrefix, input.candidate.releaseId);

    let converged = listed.length === 0;
    if (converged) {
      // A zero-object management listing is necessary, but HEAD every object
      // accepted by delete before declaring completion. This avoids treating a
      // prematurely empty eventually-consistent listing as proof of deletion.
      for (let index = 0; index < expectedPathnames.length; index += 1) {
        if (index > 0) await input.sleep(input.headDelayMs);
        const pathname = expectedPathnames[index];
        const head = await input.store.headRetentionObject(pathname);
        if (head) {
          assertReleaseObjectHead(head, pathname);
          converged = false;
          break;
        }
      }
    }
    if (converged) return;
    if (attempt < input.maxAttempts) await input.sleep(input.delayMs);
  }
  throw new PublicSnapshotRetentionError('Release deletion convergence timed out');
}

function groupInventory(objects: readonly PublicSnapshotRetentionListedObject[]): ReleaseInventory[] {
  const releases = new Map<string, ReleaseInventory>();
  for (const object of objects) {
    const parsed = parseRetentionPath(object.pathname);
    let release = releases.get(parsed.releaseId);
    if (!release) {
      release = {
        releaseId: parsed.releaseId,
        objects: [],
        manifestObject: null,
        payloadObjects: [],
      };
      releases.set(parsed.releaseId, release);
    }
    release.objects.push(object);
    if (parsed.kind === 'manifest') {
      if (release.manifestObject) {
        throw new PublicSnapshotRetentionError('Retention inventory contains duplicate release manifests');
      }
      release.manifestObject = object;
    } else {
      release.payloadObjects.push(object);
    }
  }
  return [...releases.values()];
}

function parseManifestBody(body: Uint8Array, label: string): PublicTransactionManifest {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body).toString('utf8'));
    assertPublicTransactionManifest(value);
  } catch {
    throw new PublicSnapshotRetentionError(`${label} is not a valid public transaction manifest`);
  }
  const artifactNames = value.namedArtifacts.map(({ name }) => name);
  if (!isExactSupportedArtifactSet(artifactNames)) {
    throw new PublicSnapshotRetentionError(`${label} does not contain the exact serving artifact set`);
  }
  return value;
}

function assertReadResult(
  result: PublicSnapshotRetentionReadResult,
  expected: Pick<PublicSnapshotRetentionListedObject, 'etag' | 'pathname' | 'size'>,
  label: string,
): void {
  if (result.pathname !== expected.pathname
    || result.etag !== expected.etag
    || result.size !== expected.size
    || result.body.byteLength !== expected.size) {
    throw new PublicSnapshotRetentionError(`${label} metadata does not match the management inventory`);
  }
  finiteTimestamp(result.uploadedAt, `${label} uploadedAt`);
}

function releaseTimestampPrefix(publishedAt: string): string {
  const match = publishedAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match || !Number.isFinite(Date.parse(publishedAt))) {
    throw new PublicSnapshotRetentionError('Release publishedAt is invalid');
  }
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}Z`;
}

async function readCompleteRelease(
  store: PublicSnapshotRetentionObjectStore,
  release: ReleaseInventory,
): Promise<CompleteRelease | null> {
  if (!release.manifestObject) return null;
  const read = await store.readRetentionObject(release.manifestObject.pathname, MAX_MANIFEST_BYTES);
  if (!read) {
    throw new PublicSnapshotRetentionError('A listed release manifest disappeared during retention planning');
  }
  assertReadResult(read, release.manifestObject, 'Release manifest');
  const manifest = parseManifestBody(read.body, 'Release manifest');
  if (manifest.releaseId !== release.releaseId
    || !manifest.releaseId.startsWith(`${releaseTimestampPrefix(manifest.publishedAt)}-`)) {
    throw new PublicSnapshotRetentionError('Release manifest identity does not match its immutable pathname');
  }

  const expectedPayloadSizes = new Map<string, number>();
  for (const entry of manifest.shards) expectedPayloadSizes.set(entry.shard.key, entry.shard.byteLength);
  for (const entry of manifest.namedArtifacts) {
    expectedPayloadSizes.set(entry.artifact.key, entry.artifact.byteLength);
  }
  const expectedPayloadCount = PUBLIC_TRANSACTION_SHARD_COUNT + manifest.namedArtifacts.length;
  if (manifest.shards.length !== PUBLIC_TRANSACTION_SHARD_COUNT
    || expectedPayloadSizes.size !== expectedPayloadCount
    || release.payloadObjects.length !== expectedPayloadSizes.size
    || release.objects.length !== expectedPayloadSizes.size + 1) {
    throw new PublicSnapshotRetentionError('Release inventory is incomplete or contains unreferenced payloads');
  }
  for (const object of release.payloadObjects) {
    if (expectedPayloadSizes.get(object.pathname) !== object.size) {
      throw new PublicSnapshotRetentionError('Release payload size does not match its immutable manifest');
    }
  }
  return {
    releaseId: release.releaseId,
    manifest,
    manifestBody: read.body,
    manifestObject: release.manifestObject,
    payloadObjects: release.payloadObjects,
    objects: release.objects,
  };
}

function assertDiscoveryHead(head: PublicSnapshotRetentionDiscoveryHead): void {
  if (head.pathname !== DISCOVERY_PATHNAME
    || typeof head.etag !== 'string'
    || !head.etag.trim()
    || !Number.isSafeInteger(head.size)
    || head.size < 1
    || head.size > MAX_MANIFEST_BYTES) {
    throw new PublicSnapshotRetentionError('Discovery HEAD returned invalid metadata');
  }
  finiteTimestamp(head.uploadedAt, 'Discovery HEAD uploadedAt');
}

function resolvePolicy(policy: PublicSnapshotRetentionPolicy): Required<PublicSnapshotRetentionPolicy> {
  const resolved = {
    now: policy.now ?? new Date(),
    keepCompleteReleaseCount:
      policy.keepCompleteReleaseCount ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_KEEP_COUNT,
    keepCompleteReleaseDays:
      policy.keepCompleteReleaseDays ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_KEEP_DAYS,
    orphanGraceHours: policy.orphanGraceHours ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_ORPHAN_GRACE_HOURS,
    listLimit: policy.listLimit ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_LIST_LIMIT,
    maxPages: policy.maxPages ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_PAGES,
    maxObjects: policy.maxObjects ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_MAX_OBJECTS,
  };
  if (!Number.isFinite(resolved.now.getTime())) throw new PublicSnapshotRetentionError('Retention clock is invalid');
  assertPositiveInteger(resolved.keepCompleteReleaseCount, 'Retention keep count', 10_000);
  assertPositiveInteger(resolved.keepCompleteReleaseDays, 'Retention keep days', 3_650);
  assertPositiveInteger(resolved.orphanGraceHours, 'Retention orphan grace', 24 * 365);
  return resolved;
}

/** Build a fail-closed, immutable cleanup plan. This function never deletes objects. */
export async function planPublicSnapshotRetention(input: {
  store: PublicSnapshotRetentionObjectStore;
  policy?: PublicSnapshotRetentionPolicy;
}): Promise<PublicSnapshotRetentionPlan> {
  const policy = resolvePolicy(input.policy ?? {});
  // Finish all bounded pagination before any other planning step. The executor
  // receives only this complete immutable inventory-derived plan.
  const objects = await listAllRetentionObjects(input.store, policy);
  const inventories = groupInventory(objects);
  const discoveryHead = await input.store.headRetentionDiscovery();

  if (!discoveryHead) {
    if (objects.length !== 0) {
      throw new PublicSnapshotRetentionError('Discovery is absent but the release inventory is not empty');
    }
    return {
      schema: PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA,
      plannedAt: policy.now.toISOString(),
      inventoryObjectCount: 0,
      inventoryByteLength: 0,
      currentReleaseId: null,
      currentDiscoveryEtag: null,
      discovery: null,
      protectedReleaseIds: [],
      deleteCandidates: [],
    };
  }
  assertDiscoveryHead(discoveryHead);
  const discoveryRead = await input.store.readRetentionObject(DISCOVERY_PATHNAME, MAX_MANIFEST_BYTES);
  if (!discoveryRead) throw new PublicSnapshotRetentionError('Discovery GET is absent after a successful HEAD');
  assertReadResult(discoveryRead, discoveryHead, 'Discovery manifest');
  const discoveryManifest = parseManifestBody(discoveryRead.body, 'Discovery manifest');

  const completeReleases: CompleteRelease[] = [];
  const orphans: ReleaseInventory[] = [];
  for (const inventory of inventories) {
    const complete = await readCompleteRelease(input.store, inventory);
    if (complete) completeReleases.push(complete);
    else orphans.push(inventory);
  }
  const current = completeReleases.find(({ releaseId }) => releaseId === discoveryManifest.releaseId);
  if (!current
    || current.manifestObject.size !== discoveryHead.size
    || !Buffer.from(current.manifestBody).equals(Buffer.from(discoveryRead.body))) {
    throw new PublicSnapshotRetentionError(
      'Discovery does not identify a byte-identical complete immutable release',
    );
  }

  completeReleases.sort((left, right) => {
    const timestampOrder = finiteTimestamp(right.manifest.publishedAt, 'Release publishedAt')
      - finiteTimestamp(left.manifest.publishedAt, 'Release publishedAt');
    return timestampOrder || right.releaseId.localeCompare(left.releaseId);
  });
  const keepCutoff = policy.now.getTime() - policy.keepCompleteReleaseDays * 24 * 60 * 60 * 1_000;
  const orphanCutoff = policy.now.getTime() - policy.orphanGraceHours * 60 * 60 * 1_000;
  const protectedIds = new Set<string>([discoveryManifest.releaseId]);
  const currentPublishedAt = finiteTimestamp(current.manifest.publishedAt, 'Current release publishedAt');
  const previous = completeReleases.find((release) => (
    release.releaseId !== discoveryManifest.releaseId
      && finiteTimestamp(release.manifest.publishedAt, 'Release publishedAt') < currentPublishedAt
  ));
  if (previous) protectedIds.add(previous.releaseId);
  for (const release of completeReleases.slice(0, policy.keepCompleteReleaseCount)) {
    protectedIds.add(release.releaseId);
  }
  for (const release of completeReleases) {
    if (finiteTimestamp(release.manifest.publishedAt, 'Release publishedAt') >= keepCutoff) {
      protectedIds.add(release.releaseId);
    }
  }

  const deleteCandidates: PublicSnapshotRetentionDeleteCandidate[] = [];
  for (const release of completeReleases) {
    const publishedAt = finiteTimestamp(release.manifest.publishedAt, 'Release publishedAt');
    const everyObjectOld = release.objects.every(
      (object) => finiteTimestamp(object.uploadedAt, 'Release uploadedAt') < keepCutoff,
    );
    if (!protectedIds.has(release.releaseId) && publishedAt < keepCutoff && everyObjectOld) {
      deleteCandidates.push({
        releaseId: release.releaseId,
        kind: 'complete-release',
        manifestPathname: release.manifestObject.pathname,
        manifestEtag: release.manifestObject.etag,
        publishedAt: release.manifest.publishedAt,
        payloadPathnames: release.payloadObjects.map(({ pathname }) => pathname),
        objectCount: release.objects.length,
        byteLength: release.objects.reduce((total, object) => total + object.size, 0),
      });
    }
  }
  for (const orphan of orphans) {
    if (orphan.releaseId === discoveryManifest.releaseId) {
      throw new PublicSnapshotRetentionError('The current discovery release has no immutable manifest');
    }
    if (orphan.payloadObjects.length > 0 && orphan.payloadObjects.every(
      (object) => finiteTimestamp(object.uploadedAt, 'Orphan uploadedAt') < orphanCutoff,
    )) {
      deleteCandidates.push({
        releaseId: orphan.releaseId,
        kind: 'orphan-payloads',
        manifestPathname: null,
        manifestEtag: null,
        publishedAt: null,
        payloadPathnames: orphan.payloadObjects.map(({ pathname }) => pathname),
        objectCount: orphan.payloadObjects.length,
        byteLength: orphan.payloadObjects.reduce((total, object) => total + object.size, 0),
      });
    }
  }
  deleteCandidates.sort((left, right) => left.releaseId.localeCompare(right.releaseId));

  return {
    schema: PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA,
    plannedAt: policy.now.toISOString(),
    inventoryObjectCount: objects.length,
    inventoryByteLength: objects.reduce((total, object) => total + object.size, 0),
    currentReleaseId: discoveryManifest.releaseId,
    currentDiscoveryEtag: discoveryHead.etag,
    discovery: {
      releaseId: discoveryManifest.releaseId,
      etag: discoveryHead.etag,
      size: discoveryHead.size,
      uploadedAt: discoveryHead.uploadedAt,
    },
    protectedReleaseIds: [...protectedIds].sort(),
    deleteCandidates,
  };
}

/** Stable CLI-facing alias for the inventory collection and planning phase. */
export function collectAndPlanPublicSnapshotRetention(
  store: PublicSnapshotRetentionObjectStore,
  policy: PublicSnapshotRetentionPolicy = {},
): Promise<PublicSnapshotRetentionPlan> {
  return planPublicSnapshotRetention({ store, policy });
}

function snapshotResult(result: {
  manifestTombstones: string[];
  payloadObjectsDeleted: string[];
  completedReleaseIds: string[];
}): PublicSnapshotRetentionExecutionResult {
  return {
    manifestTombstones: [...result.manifestTombstones],
    payloadObjectsDeleted: [...result.payloadObjectsDeleted],
    completedReleaseIds: [...result.completedReleaseIds],
  };
}

function assertExecutablePlan(plan: PublicSnapshotRetentionPlan): void {
  if (plan.schema !== PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA
    || !Array.isArray(plan.deleteCandidates)
    || !Array.isArray(plan.protectedReleaseIds)) {
    throw new PublicSnapshotRetentionError('Retention execution plan is invalid');
  }
  const hasDiscovery = plan.discovery !== null;
  if (hasDiscovery !== (plan.currentReleaseId !== null)
    || hasDiscovery !== (plan.currentDiscoveryEtag !== null)
    || (plan.discovery && (
      plan.discovery.releaseId !== plan.currentReleaseId
        || plan.discovery.etag !== plan.currentDiscoveryEtag
        || !RELEASE_ID_PATTERN.test(plan.discovery.releaseId)
        || !plan.discovery.etag.trim()
        || !Number.isSafeInteger(plan.discovery.size)
        || plan.discovery.size < 1
    ))) {
    throw new PublicSnapshotRetentionError('Retention execution discovery guard is invalid');
  }
  if (plan.deleteCandidates.length > 0 && !plan.discovery) {
    throw new PublicSnapshotRetentionError('Retention execution plan has no discovery guard');
  }
  const releaseIds = new Set<string>();
  const protectedIds = new Set<string>();
  for (const releaseId of plan.protectedReleaseIds) {
    if (!RELEASE_ID_PATTERN.test(releaseId) || protectedIds.has(releaseId)) {
      throw new PublicSnapshotRetentionError('Retention execution protected release set is invalid');
    }
    protectedIds.add(releaseId);
  }
  for (const candidate of plan.deleteCandidates) {
    if (!RELEASE_ID_PATTERN.test(candidate.releaseId)
      || releaseIds.has(candidate.releaseId)
      || protectedIds.has(candidate.releaseId)
      || plan.discovery?.releaseId === candidate.releaseId
      || candidate.payloadPathnames.length < 1
      || new Set(candidate.payloadPathnames).size !== candidate.payloadPathnames.length
      || !Number.isSafeInteger(candidate.objectCount)
      || !Number.isSafeInteger(candidate.byteLength)
      || candidate.byteLength < 1) {
      throw new PublicSnapshotRetentionError('Retention execution candidate is invalid');
    }
    releaseIds.add(candidate.releaseId);
    for (const pathname of candidate.payloadPathnames) {
      const parsed = parseRetentionPath(pathname);
      if (parsed.kind !== 'payload' || parsed.releaseId !== candidate.releaseId) {
        throw new PublicSnapshotRetentionError('Retention execution payload pathname is invalid');
      }
    }
    if (candidate.kind === 'complete-release') {
      const parsed = candidate.manifestPathname ? parseRetentionPath(candidate.manifestPathname) : null;
      if (!parsed
        || parsed.kind !== 'manifest'
        || parsed.releaseId !== candidate.releaseId
        || !candidate.manifestEtag?.trim()
        || candidate.publishedAt === null
        || !Number.isFinite(Date.parse(candidate.publishedAt))
        || !hasExactCompletePayloadSet(candidate.releaseId, candidate.payloadPathnames)
        || candidate.objectCount !== candidate.payloadPathnames.length + 1) {
        throw new PublicSnapshotRetentionError('Retention execution manifest tombstone is invalid');
      }
    } else if (candidate.kind !== 'orphan-payloads'
      || candidate.manifestPathname !== null
      || candidate.manifestEtag !== null
      || candidate.publishedAt !== null
      || candidate.objectCount !== candidate.payloadPathnames.length) {
      throw new PublicSnapshotRetentionError('Retention execution orphan candidate is invalid');
    }
  }
}

/** Execute a previously reviewed plan. Stops immediately after any partial failure. */
export async function executePublicSnapshotRetention(
  store: PublicSnapshotRetentionObjectStore,
  plan: PublicSnapshotRetentionPlan,
  options: PublicSnapshotRetentionExecutionOptions = {},
): Promise<PublicSnapshotRetentionExecutionResult> {
  assertExecutablePlan(plan);
  const batchSize = options.batchSize ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_DELETE_BATCH_SIZE;
  const batchDelayMs = options.batchDelayMs ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_DELETE_DELAY_MS;
  const maxAttempts = options.maxPayloadDeleteAttempts
    ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_DELETE_ATTEMPTS;
  const maxConvergenceAttempts = options.maxConvergenceAttempts
    ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_ATTEMPTS;
  const convergenceDelayMs = options.convergenceDelayMs
    ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_DELAY_MS;
  const convergenceHeadDelayMs = options.convergenceHeadDelayMs
    ?? PUBLIC_SNAPSHOT_RETENTION_DEFAULT_CONVERGENCE_HEAD_DELAY_MS;
  assertPositiveInteger(batchSize, 'Retention delete batch size', 10);
  assertPositiveInteger(batchDelayMs, 'Retention delete delay', 60_000);
  if (batchDelayMs < 1_000) throw new PublicSnapshotRetentionError('Retention delete delay must be at least 1000ms');
  assertPositiveInteger(maxAttempts, 'Retention delete retry count', 5);
  assertPositiveInteger(maxConvergenceAttempts, 'Retention convergence attempt count', 60);
  assertPositiveInteger(convergenceDelayMs, 'Retention convergence delay', 60_000);
  if (convergenceDelayMs < 1_000) {
    throw new PublicSnapshotRetentionError('Retention convergence delay must be at least 1000ms');
  }
  assertPositiveInteger(convergenceHeadDelayMs, 'Retention convergence HEAD delay', 60_000);
  if (convergenceHeadDelayMs < 100) {
    throw new PublicSnapshotRetentionError('Retention convergence HEAD delay must be at least 100ms');
  }
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>(
    (resolve) => setTimeout(resolve, milliseconds),
  ));
  const mutable = {
    manifestTombstones: [] as string[],
    payloadObjectsDeleted: [] as string[],
    completedReleaseIds: [] as string[],
  };

  for (let candidateIndex = 0; candidateIndex < plan.deleteCandidates.length; candidateIndex += 1) {
    const candidate = plan.deleteCandidates[candidateIndex];
    try {
      // Separate releases as well as intra-release batches. This keeps a final
      // 10-object payload batch from sharing a Hobby 15 ops/s window with the
      // next release's manifest tombstone and first payload batch.
      if (candidateIndex > 0) await sleep(batchDelayMs);
      const head = await store.headRetentionDiscovery();
      if (!head
        || !plan.discovery
        || head.pathname !== DISCOVERY_PATHNAME
        || head.etag !== plan.discovery.etag
        || head.size !== plan.discovery.size) {
        throw new PublicSnapshotRetentionError('Discovery changed after retention planning');
      }
      if (candidate.kind === 'complete-release') {
        await store.deleteRetentionManifest(candidate.manifestPathname!, candidate.manifestEtag!);
        mutable.manifestTombstones.push(candidate.manifestPathname!);
      }
      for (let offset = 0; offset < candidate.payloadPathnames.length; offset += batchSize) {
        const batch = candidate.payloadPathnames.slice(offset, offset + batchSize);
        if (offset > 0) await sleep(batchDelayMs);
        let deleted = false;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            await store.deleteRetentionObjects(batch);
            deleted = true;
            break;
          } catch {
            if (attempt < maxAttempts) await sleep(batchDelayMs * attempt);
          }
        }
        if (!deleted) throw new PublicSnapshotRetentionError('A retention payload delete batch failed');
        mutable.payloadObjectsDeleted.push(...batch);
      }
    } catch {
      throw new PublicSnapshotRetentionExecutionError(
        `Retention execution stopped while processing release ${candidate.releaseId}`,
        snapshotResult(mutable),
      );
    }
    try {
      await waitForReleaseDeletionConvergence({
        store,
        candidate,
        maxAttempts: maxConvergenceAttempts,
        delayMs: convergenceDelayMs,
        headDelayMs: convergenceHeadDelayMs,
        sleep,
      });
    } catch {
      throw new PublicSnapshotRetentionExecutionError(
        `Retention delete was accepted but convergence remains unverified for release ${candidate.releaseId}`,
        snapshotResult(mutable),
      );
    }
    mutable.completedReleaseIds.push(candidate.releaseId);
  }
  return snapshotResult(mutable);
}
