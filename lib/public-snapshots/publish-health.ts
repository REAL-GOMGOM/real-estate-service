import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MACMINI_SYNC_HEALTH_SCHEMA = 'naezip.macmini-sync-health.v1' as const;
export const DEFAULT_SYNC_HEALTH_MAX_AGE_HOURS = 36;

export interface MacMiniSyncHealthMarker {
  schema: typeof MACMINI_SYNC_HEALTH_SCHEMA;
  completedAt: string;
  exitCode: 0 | 1 | 2;
}

export class PublicSnapshotHealthGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicSnapshotHealthGateError';
  }
}

export function defaultMacMiniSyncHealthMarkerPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return path.resolve(
    env.NAEZIP_SYNC_HEALTH_MARKER
      ?? path.join(process.cwd(), '.local', 'macmini-sync-health.json'),
  );
}

function parseMaxAgeHours(raw: string | undefined): number {
  if (!raw) return DEFAULT_SYNC_HEALTH_MAX_AGE_HOURS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 168) {
    throw new PublicSnapshotHealthGateError('NAEZIP_SYNC_HEALTH_MAX_AGE_HOURS must be greater than 0 and at most 168');
  }
  return parsed;
}

export function assertMacMiniSyncHealthMarker(
  value: unknown,
  options: { now?: Date; maxAgeHours?: number } = {},
): asserts value is MacMiniSyncHealthMarker {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PublicSnapshotHealthGateError('Mac mini sync health marker must be an object');
  }
  const marker = value as Record<string, unknown>;
  const keys = Object.keys(marker).sort();
  if (keys.join(',') !== 'completedAt,exitCode,schema') {
    throw new PublicSnapshotHealthGateError('Mac mini sync health marker fields are invalid');
  }
  if (marker.schema !== MACMINI_SYNC_HEALTH_SCHEMA) {
    throw new PublicSnapshotHealthGateError('Mac mini sync health marker schema is unsupported');
  }
  if (marker.exitCode !== 0 && marker.exitCode !== 1 && marker.exitCode !== 2) {
    throw new PublicSnapshotHealthGateError('Mac mini sync health marker exitCode is invalid');
  }
  if (typeof marker.completedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(marker.completedAt)
    || !Number.isFinite(Date.parse(marker.completedAt))) {
    throw new PublicSnapshotHealthGateError('Mac mini sync health marker completedAt is invalid');
  }
  const nowMs = (options.now ?? new Date()).getTime();
  const completedAtMs = Date.parse(marker.completedAt);
  const maxAgeHours = options.maxAgeHours ?? DEFAULT_SYNC_HEALTH_MAX_AGE_HOURS;
  if (completedAtMs > nowMs + 5 * 60_000) {
    throw new PublicSnapshotHealthGateError('Mac mini sync health marker is from the future');
  }
  if (nowMs - completedAtMs > maxAgeHours * 3_600_000) {
    throw new PublicSnapshotHealthGateError(`Mac mini sync health marker is older than ${maxAgeHours} hours`);
  }
  if (marker.exitCode === 1) {
    throw new PublicSnapshotHealthGateError('Latest Mac mini sync is in progress or had a source/local failure (exit 1)');
  }
}

export async function readAndAssertMacMiniSyncHealth(
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: Date;
    readFileImpl?: typeof readFile;
  } = {},
): Promise<MacMiniSyncHealthMarker> {
  const env = options.env ?? process.env;
  const markerPath = defaultMacMiniSyncHealthMarkerPath(env);
  let raw: string;
  try {
    raw = await (options.readFileImpl ?? readFile)(markerPath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new PublicSnapshotHealthGateError(
        `Mac mini sync health marker is missing: ${markerPath}. Run the sync-and-publish wrapper first.`,
      );
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PublicSnapshotHealthGateError('Mac mini sync health marker is not valid JSON');
  }
  assertMacMiniSyncHealthMarker(parsed, {
    now: options.now,
    maxAgeHours: parseMaxAgeHours(env.NAEZIP_SYNC_HEALTH_MAX_AGE_HOURS),
  });
  return parsed;
}

export async function writeMacMiniSyncHealthMarker(
  markerPath: string,
  marker: MacMiniSyncHealthMarker,
): Promise<void> {
  const destination = path.resolve(markerPath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(marker)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
