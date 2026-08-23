import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, onTestFinished } from 'vitest';

import {
  PUBLICATION_FRESHNESS_SCHEMA,
  PUBLICATION_OUTCOME_SCHEMA,
  writePublicationOutcomeMarker,
  type PublicationFreshnessResult,
  type PublicationOutcomeMarker,
} from '../publication-observability';
import {
  checkPublicationOperationalHealth,
  defaultMonitoredPublicationOutcomeMarkerPath,
  evaluatePublicationOperationalHealth,
} from '../publication-operational-health';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

function remote(
  publishedAt: string,
  overrides: Partial<PublicationFreshnessResult> = {},
): PublicationFreshnessResult {
  return {
    schema: PUBLICATION_FRESHNESS_SCHEMA,
    status: 'healthy',
    reason: 'fresh',
    checkedAt: '2026-08-21T22:00:00.000Z',
    warningAfterHours: 36,
    criticalAfterHours: 48,
    publishedAt,
    releaseId: '20260821T201000Z-aaaaaaaaaaaa',
    ageSeconds: 6_600,
    ...overrides,
  };
}

function outcome(overrides: Partial<PublicationOutcomeMarker> = {}): PublicationOutcomeMarker {
  return {
    schema: PUBLICATION_OUTCOME_SCHEMA,
    attemptId: ATTEMPT_ID,
    status: 'succeeded',
    stage: 'complete',
    startedAt: '2026-08-21T20:00:00.000Z',
    completedAt: '2026-08-21T20:15:00.000Z',
    sourceCompletedAt: '2026-08-21T20:10:00.000Z',
    syncExitCode: 0,
    publisherExitCode: 0,
    dryRun: false,
    ...overrides,
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-operational-health-'));
  onTestFinished(async () => rm(directory, { recursive: true, force: true }));
  return directory;
}

describe('publication operational health', () => {
  it('changes the required KST schedule exactly at the 06:30 grace boundary', () => {
    const previousRun = remote('2026-08-20T20:10:00.000Z');

    expect(evaluatePublicationOperationalHealth(
      previousRun,
      null,
      new Date('2026-08-21T21:29:59.999Z'),
    )).toMatchObject({ status: 'healthy', reason: 'fresh' });
    expect(evaluatePublicationOperationalHealth(
      previousRun,
      null,
      new Date('2026-08-21T21:30:00.000Z'),
    )).toMatchObject({ status: 'critical', reason: 'scheduled-publication-missed' });
  });

  it('reports a real failed publication until a standalone retry publishes the same source', () => {
    const failed = outcome({
      status: 'failed',
      stage: 'publish',
      startedAt: '2026-08-21T21:00:00.000Z',
      completedAt: '2026-08-21T21:05:00.000Z',
      sourceCompletedAt: '2026-08-21T21:04:00.000Z',
      syncExitCode: 0,
      publisherExitCode: 1,
    });

    expect(evaluatePublicationOperationalHealth(
      remote('2026-08-21T20:10:00.000Z'),
      failed,
      new Date('2026-08-21T22:00:00.000Z'),
    )).toMatchObject({ status: 'critical', reason: 'last-publication-failed' });
    expect(evaluatePublicationOperationalHealth(
      remote('2026-08-21T21:04:00.000Z'),
      failed,
      new Date('2026-08-21T22:00:00.000Z'),
    )).toMatchObject({ status: 'healthy', reason: 'fresh' });
  });

  it('marks a non-dry-run publication as hung at 90 minutes, not before', () => {
    const running = outcome({
      status: 'running',
      stage: 'sync',
      startedAt: '2026-08-21T20:30:00.000Z',
      completedAt: null,
      sourceCompletedAt: null,
      syncExitCode: null,
      publisherExitCode: null,
    });
    const current = remote('2026-08-21T20:10:00.000Z');

    expect(evaluatePublicationOperationalHealth(
      current,
      running,
      new Date('2026-08-21T21:59:59.999Z'),
    )).toMatchObject({ status: 'healthy', reason: 'fresh' });
    expect(evaluatePublicationOperationalHealth(
      current,
      running,
      new Date('2026-08-21T22:00:00.000Z'),
    )).toMatchObject({ status: 'critical', reason: 'publication-running-too-long' });
  });

  it('never lets a successful marker improve a worse remote freshness result', () => {
    const warning = remote('2026-08-21T20:10:00.000Z', {
      status: 'warning',
      reason: 'stale-warning',
      ageSeconds: 36 * 3_600,
    });
    expect(evaluatePublicationOperationalHealth(
      warning,
      outcome(),
      new Date('2026-08-21T22:00:00.000Z'),
    )).toBe(warning);
  });

  it('preserves the original reason when the remote manifest is already critical', () => {
    const unavailable = remote('2026-08-21T20:10:00.000Z', {
      status: 'critical',
      reason: 'request-failed',
      publishedAt: null,
      releaseId: null,
      ageSeconds: null,
    });
    const failed = outcome({
      status: 'failed',
      stage: 'publish',
      publisherExitCode: 1,
    });

    expect(evaluatePublicationOperationalHealth(
      unavailable,
      failed,
      new Date('2026-08-21T22:00:00.000Z'),
    )).toBe(unavailable);
  });

  it('does not accept a dry-run marker as scheduled production evidence', () => {
    expect(evaluatePublicationOperationalHealth(
      remote('2026-08-20T20:10:00.000Z'),
      outcome({ dryRun: true }),
      new Date('2026-08-21T22:00:00.000Z'),
    )).toMatchObject({ status: 'critical', reason: 'scheduled-publication-missed' });
  });

  it('fails closed when a producer outcome is more than five minutes in the future', () => {
    expect(evaluatePublicationOperationalHealth(
      remote('2026-08-21T20:10:00.000Z'),
      outcome({
        startedAt: '2026-08-21T22:05:00.001Z',
        completedAt: '2026-08-21T22:05:00.001Z',
        sourceCompletedAt: '2026-08-21T22:05:00.001Z',
      }),
      new Date('2026-08-21T22:00:00.000Z'),
    )).toMatchObject({ status: 'critical', reason: 'publication-outcome-in-future' });
  });

  it('derives the installed sibling marker and reads it without exposing its path', async () => {
    const directory = await temporaryDirectory();
    const alertMarker = path.join(directory, 'public-snapshot-alert-state.json');
    const outcomeMarker = path.join(directory, 'public-snapshot-publication-outcome.json');
    const failed = outcome({
      status: 'failed',
      stage: 'publish',
      completedAt: '2026-08-21T20:20:00.000Z',
      publisherExitCode: 1,
    });
    await writePublicationOutcomeMarker(outcomeMarker, failed);
    const env = { NAEZIP_PUBLICATION_ALERT_STATE_MARKER: alertMarker };

    expect(defaultMonitoredPublicationOutcomeMarkerPath(env)).toBe(outcomeMarker);
    const result = await checkPublicationOperationalHealth({
      env,
      now: new Date('2026-08-21T22:00:00.000Z'),
      remoteCheckImpl: async () => remote('2026-08-21T20:09:00.000Z'),
    });
    expect(result).toMatchObject({ status: 'critical', reason: 'last-publication-failed' });
    expect(JSON.stringify(result)).not.toContain(directory);
  });
});
