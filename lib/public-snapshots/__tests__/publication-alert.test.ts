import { chmod, mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  PUBLICATION_ALERT_STATE_SCHEMA,
  assertPublicationAlertState,
  handlePublicationFreshnessAlert,
  publicationAlertForTransition,
  readPublicationAlertState,
  writePublicationAlertState,
} from '../publication-alert';
import {
  PUBLICATION_FRESHNESS_SCHEMA,
  type PublicationFreshnessResult,
  type PublicationFreshnessStatus,
} from '../publication-observability';
import { runPublicSnapshotFreshnessMonitorWithAlerts } from '../../../scripts/monitor-public-snapshot-freshness';

function freshness(
  status: PublicationFreshnessStatus,
  checkedAt = '2026-08-16T12:00:00.000Z',
): PublicationFreshnessResult {
  return {
    schema: PUBLICATION_FRESHNESS_SCHEMA,
    status,
    reason: status === 'healthy' ? 'fresh' : status === 'warning' ? 'stale-warning' : 'stale-critical',
    checkedAt,
    warningAfterHours: 36,
    criticalAfterHours: 48,
    publishedAt: '2026-08-14T12:00:00.000Z',
    releaseId: '20260814T120000Z-aaaaaaaaaaaa',
    ageSeconds: status === 'healthy' ? 1 : status === 'warning' ? 36 * 3_600 : 48 * 3_600,
  };
}

describe('publication freshness desktop alerts', () => {
  it('selects only warning, critical, and recovery state transitions', () => {
    expect(publicationAlertForTransition(null, 'healthy')).toBeNull();
    expect(publicationAlertForTransition(null, 'warning')).toBe('warning');
    expect(publicationAlertForTransition(null, 'critical')).toBe('critical');
    expect(publicationAlertForTransition('warning', 'warning')).toBeNull();
    expect(publicationAlertForTransition('critical', 'critical')).toBeNull();
    expect(publicationAlertForTransition('warning', 'critical')).toBe('critical');
    expect(publicationAlertForTransition('critical', 'warning')).toBe('warning');
    expect(publicationAlertForTransition('warning', 'healthy')).toBe('recovery');
    expect(publicationAlertForTransition('critical', 'healthy')).toBe('recovery');
  });

  it('atomically persists only strict non-secret state with mode 0600', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-alert-state-'));
    const markerPath = path.join(directory, 'alert-state.json');
    await chmod(directory, 0o700);
    const state = {
      schema: PUBLICATION_ALERT_STATE_SCHEMA,
      status: 'warning' as const,
      changedAt: '2026-08-16T12:00:00.000Z',
    };

    await writePublicationAlertState(markerPath, state);

    await expect(readPublicationAlertState(markerPath)).resolves.toEqual(state);
    expect((await stat(markerPath)).mode & 0o777).toBe(0o600);
    expect(Object.keys(state).sort()).toEqual(['changedAt', 'schema', 'status']);
    expect(() => assertPublicationAlertState({ ...state, url: 'https://secret.example/' }))
      .toThrow('fields are invalid');
  });

  it('deduplicates repeated states and notifies every meaningful transition', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-alert-transitions-'));
    const markerPath = path.join(directory, 'alert-state.json');
    const notifications: string[] = [];
    const notifier = vi.fn(async (kind) => { notifications.push(kind); });

    await expect(handlePublicationFreshnessAlert(freshness('healthy'), {
      markerPath,
      notifier,
    })).resolves.toMatchObject({ notification: null, stateChanged: true });
    await expect(handlePublicationFreshnessAlert(freshness('healthy'), {
      markerPath,
      notifier,
    })).resolves.toMatchObject({ notification: null, stateChanged: false });
    await handlePublicationFreshnessAlert(freshness('warning', '2026-08-16T13:00:00.000Z'), {
      markerPath,
      notifier,
    });
    await handlePublicationFreshnessAlert(freshness('warning', '2026-08-16T14:00:00.000Z'), {
      markerPath,
      notifier,
    });
    await handlePublicationFreshnessAlert(freshness('critical', '2026-08-16T15:00:00.000Z'), {
      markerPath,
      notifier,
    });
    await handlePublicationFreshnessAlert(freshness('warning', '2026-08-16T16:00:00.000Z'), {
      markerPath,
      notifier,
    });
    await handlePublicationFreshnessAlert(freshness('healthy', '2026-08-16T17:00:00.000Z'), {
      markerPath,
      notifier,
    });

    expect(notifications).toEqual(['warning', 'critical', 'warning', 'recovery']);
    await expect(readPublicationAlertState(markerPath)).resolves.toEqual({
      schema: PUBLICATION_ALERT_STATE_SCHEMA,
      status: 'healthy',
      changedAt: '2026-08-16T17:00:00.000Z',
    });
  });

  it('repairs a corrupt marker without suppressing a current critical alert', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-alert-repair-'));
    const markerPath = path.join(directory, 'alert-state.json');
    await writeFile(markerPath, '{"broken":true}\n', { encoding: 'utf8', mode: 0o600 });
    const notifier = vi.fn(async () => undefined);

    await handlePublicationFreshnessAlert(freshness('critical'), { markerPath, notifier });

    expect(notifier).toHaveBeenCalledWith('critical');
    await expect(readPublicationAlertState(markerPath)).resolves.toMatchObject({ status: 'critical' });
  });

  it('keeps the exact healthy JSON/exit result when recovery notification fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-alert-failure-'));
    const markerPath = path.join(directory, 'alert-state.json');
    await writePublicationAlertState(markerPath, {
      schema: PUBLICATION_ALERT_STATE_SCHEMA,
      status: 'warning',
      changedAt: '2026-08-16T11:00:00.000Z',
    });
    const expected = freshness('healthy');
    const lines: string[] = [];
    const notifier = vi.fn(async () => { throw new Error('planned notifier failure'); });

    const exitCode = await runPublicSnapshotFreshnessMonitorWithAlerts({
      args: [],
      alertStateMarkerPath: markerPath,
      checkImpl: async () => expected,
      notifier,
      write: (line) => lines.push(line),
    });

    expect(exitCode).toBe(0);
    expect(lines).toEqual([JSON.stringify(expected)]);
    expect(notifier).toHaveBeenCalledWith('recovery');
    await expect(readPublicationAlertState(markerPath)).resolves.toMatchObject({ status: 'warning' });
  });

  it('keeps critical exit 2 when its desktop notification fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-critical-alert-failure-'));
    const expected = freshness('critical');
    const lines: string[] = [];

    const exitCode = await runPublicSnapshotFreshnessMonitorWithAlerts({
      args: [],
      alertStateMarkerPath: path.join(directory, 'alert-state.json'),
      checkImpl: async () => expected,
      notifier: async () => { throw new Error('planned notifier failure'); },
      write: (line) => lines.push(line),
    });

    expect(exitCode).toBe(2);
    expect(lines).toEqual([JSON.stringify(expected)]);
  });
});
