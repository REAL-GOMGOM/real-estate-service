import { chmod, mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { PUBLIC_TRANSACTION_DISTRICT_COUNT } from '../contract';
import type { PublicSnapshotObjectStore } from '../object-store';
import {
  PUBLICATION_FRESHNESS_CRITICAL_HOURS,
  PUBLICATION_FRESHNESS_WARNING_HOURS,
  PUBLICATION_OUTCOME_SCHEMA,
  assertPublicationOutcomeMarker,
  checkRemotePublicationFreshness,
  evaluatePublicationFreshness,
  publicationFreshnessExitCode,
  readPublicationOutcomeMarker,
  writePublicationOutcomeMarker,
  type PublicationOutcomeMarker,
} from '../publication-observability';
import { publishPublicSnapshotRelease } from '../publisher';
import { createPublicTransactionSnapshot } from '../source-mappers';
import { runPublicSnapshotFreshnessMonitor } from '../../../scripts/check-public-snapshot-freshness';
import { runSyncAndPublish } from '../../../scripts/run-local-sync-and-publish';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const BASE_URL = 'https://snapshot.example.test/';

function outcome(overrides: Partial<PublicationOutcomeMarker> = {}): PublicationOutcomeMarker {
  return {
    schema: PUBLICATION_OUTCOME_SCHEMA,
    attemptId: ATTEMPT_ID,
    status: 'succeeded',
    stage: 'complete',
    startedAt: '2026-08-16T00:00:00.000Z',
    completedAt: '2026-08-16T00:10:00.000Z',
    sourceCompletedAt: '2026-08-16T00:08:00.000Z',
    syncExitCode: 0,
    publisherExitCode: 0,
    dryRun: false,
    ...overrides,
  };
}

describe('publication outcome marker', () => {
  it('atomically writes a strict 0600 outcome marker', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-publication-outcome-'));
    const markerPath = path.join(directory, 'outcome.json');
    await chmod(directory, 0o700);

    await writePublicationOutcomeMarker(markerPath, outcome());

    await expect(readPublicationOutcomeMarker(markerPath)).resolves.toEqual(outcome());
    expect((await stat(markerPath)).mode & 0o777).toBe(0o600);
  });

  it('rejects inconsistent or extra marker fields', () => {
    expect(() => assertPublicationOutcomeMarker(outcome({
      status: 'running',
      completedAt: '2026-08-16T00:10:00.000Z',
    }))).toThrow('must not have completedAt');
    expect(() => assertPublicationOutcomeMarker({ ...outcome(), secret: 'forbidden' }))
      .toThrow('fields are invalid');
  });

  it('records the final wrapper result without changing the sync health contract', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-wrapper-outcome-'));
    const markerPath = path.join(directory, 'sync-health.json');
    const outcomeMarkerPath = path.join(directory, 'publication-outcome.json');
    const instants = [
      new Date('2026-08-16T00:00:00.000Z'),
      new Date('2026-08-16T00:08:00.000Z'),
      new Date('2026-08-16T00:10:00.000Z'),
    ];
    const results = [
      { code: 0, signal: null },
      { code: 2, signal: null },
      { code: 0, signal: null },
    ];

    const code = await runSyncAndPublish({
      markerPath,
      outcomeMarkerPath,
      outcomeAttemptId: ATTEMPT_ID,
      publisherArgs: ['--dry-run'],
      nodePath: '/test/node',
      childEnv: { NODE_ENV: 'test' },
      now: () => instants.shift()!,
      runImpl: async () => results.shift()!,
    });

    expect(code).toBe(0);
    await expect(readPublicationOutcomeMarker(outcomeMarkerPath)).resolves.toEqual(outcome({
      startedAt: '2026-08-16T00:00:00.000Z',
      completedAt: '2026-08-16T00:10:00.000Z',
      sourceCompletedAt: '2026-08-16T00:08:00.000Z',
      syncExitCode: 2,
      dryRun: true,
    }));
  });

  it('records a publish launch failure and never retries an unclassified failure', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-wrapper-outcome-failure-'));
    const outcomeMarkerPath = path.join(directory, 'publication-outcome.json');
    const instants = [
      new Date('2026-08-16T00:00:00.000Z'),
      new Date('2026-08-16T00:08:00.000Z'),
      new Date('2026-08-16T00:09:00.000Z'),
    ];
    let publisherCalls = 0;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await runSyncAndPublish({
      markerPath: path.join(directory, 'sync-health.json'),
      outcomeMarkerPath,
      outcomeAttemptId: ATTEMPT_ID,
      nodePath: '/test/node',
      childEnv: { NODE_ENV: 'test' },
      now: () => instants.shift()!,
      runImpl: async (_command, args) => {
        if (args[2] === 'scripts/publish-public-transactions.ts') {
          publisherCalls += 1;
          throw new Error('unclassified child launch failure');
        }
        return { code: 0, signal: null };
      },
    });

    expect(code).toBe(1);
    expect(publisherCalls).toBe(1);
    await expect(readPublicationOutcomeMarker(outcomeMarkerPath)).resolves.toMatchObject({
      status: 'failed',
      stage: 'publish',
      completedAt: '2026-08-16T00:09:00.000Z',
      sourceCompletedAt: '2026-08-16T00:08:00.000Z',
      syncExitCode: 0,
      publisherExitCode: null,
    });
  });
});

describe('remote publication freshness monitor', () => {
  const release = {
    publishedAt: '2026-08-14T12:00:00.000Z',
    releaseId: '20260814T120000Z-aaaaaaaaaaaa',
  };

  it('uses exact 36-hour warning and 48-hour critical boundaries', () => {
    const healthy = evaluatePublicationFreshness(
      release,
      new Date('2026-08-15T23:59:59.999Z'),
    );
    const warning = evaluatePublicationFreshness(
      release,
      new Date('2026-08-16T00:00:00.000Z'),
    );
    const critical = evaluatePublicationFreshness(
      release,
      new Date('2026-08-16T12:00:00.000Z'),
    );

    expect(healthy).toMatchObject({ status: 'healthy', reason: 'fresh' });
    expect(warning).toMatchObject({
      status: 'warning',
      reason: 'stale-warning',
      warningAfterHours: PUBLICATION_FRESHNESS_WARNING_HOURS,
      ageSeconds: 36 * 3_600,
    });
    expect(critical).toMatchObject({
      status: 'critical',
      reason: 'stale-critical',
      criticalAfterHours: PUBLICATION_FRESHNESS_CRITICAL_HOURS,
      ageSeconds: 48 * 3_600,
    });
    expect(publicationFreshnessExitCode(healthy)).toBe(0);
    expect(publicationFreshnessExitCode(warning)).toBe(1);
    expect(publicationFreshnessExitCode(critical)).toBe(2);
  });

  it('treats a manifest timestamp more than five minutes in the future as critical', () => {
    expect(evaluatePublicationFreshness(
      { ...release, publishedAt: '2026-08-16T00:05:01.000Z' },
      new Date('2026-08-16T00:00:00.000Z'),
    )).toMatchObject({
      status: 'critical',
      reason: 'published-at-in-future',
      ageSeconds: 0,
    });
  });

  it('fails closed before fetch for missing, credentialed, or non-root base URLs', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(checkRemotePublicationFreshness({ env: {}, fetchImpl }))
      .resolves.toMatchObject({ status: 'critical', reason: 'base-url-not-configured' });
    await expect(checkRemotePublicationFreshness({
      env: { NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: 'https://user:secret@example.test/' },
      fetchImpl,
    })).resolves.toMatchObject({ status: 'critical', reason: 'invalid-base-url' });
    await expect(checkRemotePublicationFreshness({
      env: { NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: 'https://example.test/private/' },
      fetchImpl,
    })).resolves.toMatchObject({ status: 'critical', reason: 'invalid-base-url' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a closed critical reason without echoing response data', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('{"token":"do-not-log"}', { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await checkRemotePublicationFreshness({
      env: { NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: BASE_URL },
      fetchImpl,
      now: new Date('2026-08-16T00:00:00.000Z'),
    });
    expect(result).toMatchObject({ status: 'critical', reason: 'invalid-manifest' });
    expect(JSON.stringify(result)).not.toContain('do-not-log');
  });

  it('emits exactly one JSON line and maps an unavailable manifest to exit 2', async () => {
    const lines: string[] = [];
    const fetchImpl = vi.fn(
      async () => new Response('not-json', { status: 503 }),
    ) as unknown as typeof fetch;
    const code = await runPublicSnapshotFreshnessMonitor({
      args: [],
      env: { NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: BASE_URL },
      fetchImpl,
      now: new Date('2026-08-16T00:00:00.000Z'),
      write: (line) => lines.push(line),
    });

    expect(code).toBe(2);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      schema: 'naezip.public-snapshot-freshness.v1',
      status: 'critical',
      reason: 'request-failed',
    });
  });

  it('validates a strict remote manifest and maps the warning boundary to exit 1', async () => {
    const publishedAt = '2026-08-14T12:00:00.000Z';
    const store: PublicSnapshotObjectStore = {
      putObject: async (input) => ({
        key: input.key,
        url: `${BASE_URL}${input.key}`,
        etag: null,
        byteLength: input.body.byteLength,
      }),
    };
    const snapshots = Array.from({ length: PUBLIC_TRANSACTION_DISTRICT_COUNT }, (_, index) =>
      createPublicTransactionSnapshot({
        lawdCd: String(10_000 + index),
        district: `테스트구${index}`,
        period: { from: '2026-07-01', through: '2026-08-31' },
        generatedAt: publishedAt,
        records: [],
      }));
    const publication = await publishPublicSnapshotRelease({
      store,
      snapshots,
      publishedAt,
    });
    const fetchImpl = vi.fn(
      async () => Response.json(publication.manifest),
    ) as unknown as typeof fetch;
    const lines: string[] = [];

    const code = await runPublicSnapshotFreshnessMonitor({
      args: [],
      env: { NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: BASE_URL },
      fetchImpl,
      now: new Date('2026-08-16T00:00:00.000Z'),
      write: (line) => lines.push(line),
    });

    expect(code).toBe(1);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      status: 'warning',
      reason: 'stale-warning',
      releaseId: publication.releaseId,
      ageSeconds: 36 * 3_600,
    });
  });
});
