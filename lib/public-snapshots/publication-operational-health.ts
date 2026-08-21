import path from 'node:path';

import {
  PUBLICATION_OUTCOME_MARKER_ENV,
  checkRemotePublicationFreshness,
  defaultPublicationOutcomeMarkerPath,
  readPublicationOutcomeMarker,
  type PublicationFreshnessReason,
  type PublicationFreshnessResult,
  type PublicationOutcomeMarker,
} from './publication-observability';

export const PUBLICATION_SCHEDULE_HOUR_KST = 5;
export const PUBLICATION_OPERATIONAL_GRACE_MINUTES = 90;
const KST_OFFSET_HOURS = 9;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;
const ALERT_STATE_MARKER_ENV = 'NAEZIP_PUBLICATION_ALERT_STATE_MARKER';
const OUTCOME_MARKER_FILE = 'public-snapshot-publication-outcome.json';

type OperationalCriticalReason = Extract<PublicationFreshnessReason,
  | 'last-publication-failed'
  | 'publication-running-too-long'
  | 'scheduled-publication-missed'
  | 'publication-outcome-in-future'>;

function timestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestDueScheduleTimestamp(now: Date): number {
  const shifted = new Date(now.getTime() + KST_OFFSET_HOURS * 3_600_000);
  let scheduledAt = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    PUBLICATION_SCHEDULE_HOUR_KST - KST_OFFSET_HOURS,
  );
  const deadline = scheduledAt + PUBLICATION_OPERATIONAL_GRACE_MINUTES * 60_000;
  if (now.getTime() < deadline) scheduledAt -= 24 * 3_600_000;
  return scheduledAt;
}

function critical(
  remote: PublicationFreshnessResult,
  reason: OperationalCriticalReason,
): PublicationFreshnessResult {
  if (remote.status === 'critical') return remote;
  return { ...remote, status: 'critical', reason };
}

function remotePublishedTimestamp(remote: PublicationFreshnessResult): number | null {
  return timestamp(remote.publishedAt);
}

function remoteSupersedesOutcome(
  remotePublishedAt: number | null,
  outcome: PublicationOutcomeMarker,
): boolean {
  const sourceCompletedAt = timestamp(outcome.sourceCompletedAt);
  if (remotePublishedAt === null) return false;
  if (sourceCompletedAt !== null) return remotePublishedAt >= sourceCompletedAt;
  const outcomeAt = timestamp(outcome.completedAt) ?? timestamp(outcome.startedAt);
  return outcomeAt !== null && remotePublishedAt > outcomeAt;
}

/**
 * Combine public serving freshness with the latest local producer outcome.
 * Operational evidence can only make a remote result worse, never mask a
 * stale or unreadable public manifest.
 */
export function evaluatePublicationOperationalHealth(
  remote: PublicationFreshnessResult,
  outcome: PublicationOutcomeMarker | null,
  now: Date,
): PublicationFreshnessResult {
  const nowMs = now.getTime();
  const remotePublishedAt = remotePublishedTimestamp(remote);

  if (outcome) {
    const startedAt = timestamp(outcome.startedAt)!;
    const completedAt = timestamp(outcome.completedAt);
    if (startedAt > nowMs + MAX_CLOCK_SKEW_MS
      || (completedAt !== null && completedAt > nowMs + MAX_CLOCK_SKEW_MS)) {
      return critical(remote, 'publication-outcome-in-future');
    }

    const superseded = remoteSupersedesOutcome(remotePublishedAt, outcome);
    if (!outcome.dryRun && outcome.status === 'failed' && !superseded) {
      return critical(remote, 'last-publication-failed');
    }
    if (!outcome.dryRun
      && outcome.status === 'running'
      && nowMs - startedAt >= PUBLICATION_OPERATIONAL_GRACE_MINUTES * 60_000
      && !superseded) {
      return critical(remote, 'publication-running-too-long');
    }
  }

  const dueSchedule = latestDueScheduleTimestamp(now);
  const markerProvesRun = outcome?.status === 'succeeded'
    && !outcome.dryRun
    && timestamp(outcome.completedAt)! >= dueSchedule;
  const remoteProvesRun = remotePublishedAt !== null && remotePublishedAt >= dueSchedule;
  if (!markerProvesRun && !remoteProvesRun) {
    return critical(remote, 'scheduled-publication-missed');
  }
  return remote;
}

/**
 * The installed monitor already has the alert marker's state directory. Use
 * its sibling outcome marker when an explicit path is absent so upgraded code
 * gains outcome awareness without reloading the LaunchAgent.
 */
export function defaultMonitoredPublicationOutcomeMarkerPath(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const explicit = env[PUBLICATION_OUTCOME_MARKER_ENV]?.trim();
  if (explicit) return path.resolve(explicit);
  const alertMarker = env[ALERT_STATE_MARKER_ENV]?.trim();
  if (alertMarker) {
    return path.join(path.dirname(path.resolve(alertMarker)), OUTCOME_MARKER_FILE);
  }
  return defaultPublicationOutcomeMarkerPath(env);
}

export async function checkPublicationOperationalHealth(
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
    now?: Date;
    outcomeMarkerPath?: string;
    remoteCheckImpl?: () => Promise<PublicationFreshnessResult>;
  } = {},
): Promise<PublicationFreshnessResult> {
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const remote = options.remoteCheckImpl
    ? await options.remoteCheckImpl()
    : await checkRemotePublicationFreshness({
        env,
        fetchImpl: options.fetchImpl,
        now,
      });
  let outcome: PublicationOutcomeMarker | null = null;
  try {
    outcome = await readPublicationOutcomeMarker(
      options.outcomeMarkerPath ?? defaultMonitoredPublicationOutcomeMarkerPath(env),
    );
  } catch {
    // Missing/corrupt local state is handled by the schedule evidence below.
    // Never include filesystem paths or marker contents in the public result.
  }
  return evaluatePublicationOperationalHealth(remote, outcome, now);
}
