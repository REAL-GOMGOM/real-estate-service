import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  PublicationFreshnessResult,
  PublicationFreshnessStatus,
} from './publication-observability';

export const PUBLICATION_ALERT_STATE_SCHEMA = 'naezip.public-snapshot-alert-state.v1' as const;
export const PUBLICATION_ALERT_STATE_MARKER_ENV = 'NAEZIP_PUBLICATION_ALERT_STATE_MARKER' as const;

export type PublicationAlertKind = 'warning' | 'critical' | 'recovery';

export interface PublicationAlertState {
  schema: typeof PUBLICATION_ALERT_STATE_SCHEMA;
  status: PublicationFreshnessStatus;
  changedAt: string;
}

export interface PublicationAlertTransitionResult {
  previousStatus: PublicationFreshnessStatus | null;
  currentStatus: PublicationFreshnessStatus;
  notification: PublicationAlertKind | null;
  stateChanged: boolean;
}

export type PublicationNotifier = (kind: PublicationAlertKind) => Promise<void>;

const ALERT_STATE_KEYS = ['changedAt', 'schema', 'status'] as const;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const NOTIFICATION_TITLE = '내집 실거래 발행 상태';
const NOTIFICATION_MESSAGES: Readonly<Record<PublicationAlertKind, string>> = Object.freeze({
  warning: '실거래 스냅샷이 36시간 이상 갱신되지 않았습니다.',
  critical: '실거래 자동 발행이 실패·미실행됐거나 공개 스냅샷 확인에 실패했습니다.',
  recovery: '실거래 스냅샷 갱신 상태가 정상으로 회복되었습니다.',
});

function isUtcIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && UTC_ISO_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

export function defaultPublicationAlertStateMarkerPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return path.resolve(
    env[PUBLICATION_ALERT_STATE_MARKER_ENV]
      ?? path.join(process.cwd(), '.local', 'public-snapshot-alert-state.json'),
  );
}

export function assertPublicationAlertState(value: unknown): asserts value is PublicationAlertState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Publication alert state must be an object');
  }
  const state = value as Record<string, unknown>;
  const actualKeys = Object.keys(state).sort();
  const expectedKeys = [...ALERT_STATE_KEYS].sort();
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error('Publication alert state fields are invalid');
  }
  if (state.schema !== PUBLICATION_ALERT_STATE_SCHEMA) {
    throw new Error('Publication alert state schema is unsupported');
  }
  if (state.status !== 'healthy' && state.status !== 'warning' && state.status !== 'critical') {
    throw new Error('Publication alert state status is invalid');
  }
  if (!isUtcIsoTimestamp(state.changedAt)) {
    throw new Error('Publication alert state changedAt is invalid');
  }
}

export async function readPublicationAlertState(
  markerPath: string,
): Promise<PublicationAlertState | null> {
  let raw: string;
  try {
    raw = await readFile(path.resolve(markerPath), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw new Error('Publication alert state cannot be read');
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Publication alert state is not valid JSON');
  }
  assertPublicationAlertState(value);
  return value;
}

export async function writePublicationAlertState(
  markerPath: string,
  state: PublicationAlertState,
): Promise<void> {
  assertPublicationAlertState(state);
  const destination = path.resolve(markerPath);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(state)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export function publicationAlertForTransition(
  previousStatus: PublicationFreshnessStatus | null,
  currentStatus: PublicationFreshnessStatus,
): PublicationAlertKind | null {
  if (previousStatus === currentStatus) return null;
  if (currentStatus === 'healthy') return previousStatus === null ? null : 'recovery';
  return currentStatus;
}

export const notifyMacOSPublicationAlert: PublicationNotifier = async (kind) => {
  const message = NOTIFICATION_MESSAGES[kind];
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(NOTIFICATION_TITLE)}`;
  await new Promise<void>((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-e', script],
      { timeout: 5_000, maxBuffer: 16 * 1024 },
      (error) => {
        if (error) reject(new Error('macOS publication notification failed'));
        else resolve();
      },
    );
  });
};

export async function handlePublicationFreshnessAlert(
  freshness: PublicationFreshnessResult,
  options: {
    markerPath?: string;
    env?: Readonly<Record<string, string | undefined>>;
    notifier?: PublicationNotifier;
  } = {},
): Promise<PublicationAlertTransitionResult> {
  const markerPath = options.markerPath
    ?? defaultPublicationAlertStateMarkerPath(options.env ?? process.env);
  let previous: PublicationAlertState | null;
  try {
    previous = await readPublicationAlertState(markerPath);
  } catch {
    // A corrupt marker must not suppress a current warning/critical alert.
    // The next successful notification/state write repairs it atomically.
    previous = null;
  }
  const notification = publicationAlertForTransition(previous?.status ?? null, freshness.status);
  if (notification !== null) {
    await (options.notifier ?? notifyMacOSPublicationAlert)(notification);
  }
  const stateChanged = previous?.status !== freshness.status;
  if (stateChanged) {
    await writePublicationAlertState(markerPath, {
      schema: PUBLICATION_ALERT_STATE_SCHEMA,
      status: freshness.status,
      changedAt: freshness.checkedAt,
    });
  }
  return {
    previousStatus: previous?.status ?? null,
    currentStatus: freshness.status,
    notification,
    stateChanged,
  };
}
