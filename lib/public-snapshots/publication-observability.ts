import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PublicSnapshotValidationError } from './contract';
import { PublicSnapshotReader } from './reader';
import { PUBLIC_SNAPSHOT_BASE_URL_ENV } from './runtime';

export const PUBLICATION_OUTCOME_SCHEMA = 'naezip.public-snapshot-publication-outcome.v1' as const;
export const PUBLICATION_FRESHNESS_SCHEMA = 'naezip.public-snapshot-freshness.v1' as const;
export const PUBLICATION_OUTCOME_MARKER_ENV = 'NAEZIP_PUBLICATION_OUTCOME_MARKER' as const;
export const PUBLICATION_FRESHNESS_WARNING_HOURS = 36;
export const PUBLICATION_FRESHNESS_CRITICAL_HOURS = 48;

export type PublicationOutcomeStatus = 'running' | 'succeeded' | 'failed';
export type PublicationOutcomeStage = 'preflight' | 'sync' | 'publish' | 'complete';

export interface PublicationOutcomeMarker {
  schema: typeof PUBLICATION_OUTCOME_SCHEMA;
  attemptId: string;
  status: PublicationOutcomeStatus;
  stage: PublicationOutcomeStage;
  startedAt: string;
  completedAt: string | null;
  sourceCompletedAt: string | null;
  syncExitCode: 0 | 1 | 2 | null;
  publisherExitCode: number | null;
  dryRun: boolean;
}

export type PublicationFreshnessStatus = 'healthy' | 'warning' | 'critical';
export type PublicationFreshnessReason =
  | 'fresh'
  | 'stale-warning'
  | 'stale-critical'
  | 'published-at-in-future'
  | 'base-url-not-configured'
  | 'invalid-base-url'
  | 'invalid-manifest'
  | 'request-failed'
  | 'invalid-arguments'
  | 'internal-error';

export interface PublicationFreshnessResult {
  schema: typeof PUBLICATION_FRESHNESS_SCHEMA;
  status: PublicationFreshnessStatus;
  reason: PublicationFreshnessReason;
  checkedAt: string;
  warningAfterHours: typeof PUBLICATION_FRESHNESS_WARNING_HOURS;
  criticalAfterHours: typeof PUBLICATION_FRESHNESS_CRITICAL_HOURS;
  publishedAt: string | null;
  releaseId: string | null;
  ageSeconds: number | null;
}

const OUTCOME_MARKER_KEYS = [
  'attemptId',
  'completedAt',
  'dryRun',
  'publisherExitCode',
  'schema',
  'sourceCompletedAt',
  'stage',
  'startedAt',
  'status',
  'syncExitCode',
] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

function isUtcIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && UTC_ISO_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function defaultPublicationOutcomeMarkerPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return path.resolve(
    env[PUBLICATION_OUTCOME_MARKER_ENV]
      ?? path.join(process.cwd(), '.local', 'public-snapshot-publication-outcome.json'),
  );
}

export function createPublicationAttemptId(): string {
  return randomUUID();
}

export function assertPublicationOutcomeMarker(
  value: unknown,
): asserts value is PublicationOutcomeMarker {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Publication outcome marker must be an object');
  }
  const marker = value as Record<string, unknown>;
  if (!hasExactKeys(marker, OUTCOME_MARKER_KEYS)) {
    throw new Error('Publication outcome marker fields are invalid');
  }
  if (marker.schema !== PUBLICATION_OUTCOME_SCHEMA) {
    throw new Error('Publication outcome marker schema is unsupported');
  }
  if (typeof marker.attemptId !== 'string' || !UUID_PATTERN.test(marker.attemptId)) {
    throw new Error('Publication outcome marker attemptId is invalid');
  }
  if (!['running', 'succeeded', 'failed'].includes(String(marker.status))) {
    throw new Error('Publication outcome marker status is invalid');
  }
  if (!['preflight', 'sync', 'publish', 'complete'].includes(String(marker.stage))) {
    throw new Error('Publication outcome marker stage is invalid');
  }
  if (!isUtcIsoTimestamp(marker.startedAt)) {
    throw new Error('Publication outcome marker startedAt is invalid');
  }
  if (marker.completedAt !== null && !isUtcIsoTimestamp(marker.completedAt)) {
    throw new Error('Publication outcome marker completedAt is invalid');
  }
  if (marker.sourceCompletedAt !== null && !isUtcIsoTimestamp(marker.sourceCompletedAt)) {
    throw new Error('Publication outcome marker sourceCompletedAt is invalid');
  }
  if (marker.syncExitCode !== null
    && marker.syncExitCode !== 0
    && marker.syncExitCode !== 1
    && marker.syncExitCode !== 2) {
    throw new Error('Publication outcome marker syncExitCode is invalid');
  }
  if (marker.publisherExitCode !== null
    && (!Number.isSafeInteger(marker.publisherExitCode)
      || Number(marker.publisherExitCode) < 0
      || Number(marker.publisherExitCode) > 255)) {
    throw new Error('Publication outcome marker publisherExitCode is invalid');
  }
  if (typeof marker.dryRun !== 'boolean') {
    throw new Error('Publication outcome marker dryRun is invalid');
  }

  const status = marker.status as PublicationOutcomeStatus;
  const stage = marker.stage as PublicationOutcomeStage;
  if (status === 'running' && marker.completedAt !== null) {
    throw new Error('Running publication outcome must not have completedAt');
  }
  if (status !== 'running' && marker.completedAt === null) {
    throw new Error('Completed publication outcome must have completedAt');
  }
  if (status === 'succeeded'
    && (stage !== 'complete' || marker.syncExitCode === null || marker.publisherExitCode !== 0)) {
    throw new Error('Succeeded publication outcome fields are inconsistent');
  }
}

export async function writePublicationOutcomeMarker(
  markerPath: string,
  marker: PublicationOutcomeMarker,
): Promise<void> {
  assertPublicationOutcomeMarker(marker);
  const destination = path.resolve(markerPath);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(marker)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function readPublicationOutcomeMarker(markerPath: string): Promise<PublicationOutcomeMarker> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path.resolve(markerPath), 'utf8'));
  } catch {
    throw new Error('Publication outcome marker is missing or not valid JSON');
  }
  assertPublicationOutcomeMarker(value);
  return value;
}

function result(
  input: Omit<PublicationFreshnessResult, 'schema' | 'warningAfterHours' | 'criticalAfterHours'>,
): PublicationFreshnessResult {
  return {
    schema: PUBLICATION_FRESHNESS_SCHEMA,
    warningAfterHours: PUBLICATION_FRESHNESS_WARNING_HOURS,
    criticalAfterHours: PUBLICATION_FRESHNESS_CRITICAL_HOURS,
    ...input,
  };
}

function safeRemoteBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:'
      || url.username
      || url.password
      || url.pathname !== '/'
      || url.search
      || url.hash) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function evaluatePublicationFreshness(
  manifest: { publishedAt: string; releaseId: string },
  now: Date,
): PublicationFreshnessResult {
  const checkedAt = now.toISOString();
  const ageMs = now.getTime() - Date.parse(manifest.publishedAt);
  const ageSeconds = Math.max(0, Math.floor(ageMs / 1_000));
  if (ageMs < -MAX_CLOCK_SKEW_MS) {
    return result({
      status: 'critical',
      reason: 'published-at-in-future',
      checkedAt,
      publishedAt: manifest.publishedAt,
      releaseId: manifest.releaseId,
      ageSeconds: 0,
    });
  }
  if (ageMs >= PUBLICATION_FRESHNESS_CRITICAL_HOURS * 3_600_000) {
    return result({
      status: 'critical',
      reason: 'stale-critical',
      checkedAt,
      publishedAt: manifest.publishedAt,
      releaseId: manifest.releaseId,
      ageSeconds,
    });
  }
  if (ageMs >= PUBLICATION_FRESHNESS_WARNING_HOURS * 3_600_000) {
    return result({
      status: 'warning',
      reason: 'stale-warning',
      checkedAt,
      publishedAt: manifest.publishedAt,
      releaseId: manifest.releaseId,
      ageSeconds,
    });
  }
  return result({
    status: 'healthy',
    reason: 'fresh',
    checkedAt,
    publishedAt: manifest.publishedAt,
    releaseId: manifest.releaseId,
    ageSeconds,
  });
}

export async function checkRemotePublicationFreshness(
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
    now?: Date;
  } = {},
): Promise<PublicationFreshnessResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const checkedAt = now.toISOString();
  const configured = env[PUBLIC_SNAPSHOT_BASE_URL_ENV]?.trim();
  if (!configured) {
    return result({
      status: 'critical',
      reason: 'base-url-not-configured',
      checkedAt,
      publishedAt: null,
      releaseId: null,
      ageSeconds: null,
    });
  }
  const baseUrl = safeRemoteBaseUrl(configured);
  if (!baseUrl) {
    return result({
      status: 'critical',
      reason: 'invalid-base-url',
      checkedAt,
      publishedAt: null,
      releaseId: null,
      ageSeconds: null,
    });
  }

  try {
    const manifest = await new PublicSnapshotReader({
      baseUrl,
      fetchImpl: options.fetchImpl,
    }).getManifest();
    return evaluatePublicationFreshness(manifest, now);
  } catch (error) {
    return result({
      status: 'critical',
      reason: error instanceof PublicSnapshotValidationError ? 'invalid-manifest' : 'request-failed',
      checkedAt,
      publishedAt: null,
      releaseId: null,
      ageSeconds: null,
    });
  }
}

export function publicationFreshnessExitCode(resultValue: PublicationFreshnessResult): 0 | 1 | 2 {
  if (resultValue.status === 'healthy') return 0;
  if (resultValue.status === 'warning') return 1;
  return 2;
}
