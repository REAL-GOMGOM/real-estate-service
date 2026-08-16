import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  handlePublicationFreshnessAlert,
  type PublicationNotifier,
} from '../lib/public-snapshots/publication-alert';
import {
  checkRemotePublicationFreshness,
  publicationFreshnessExitCode,
  type PublicationFreshnessResult,
} from '../lib/public-snapshots/publication-observability';
import { runPublicSnapshotFreshnessMonitor } from './check-public-snapshot-freshness';

export async function runPublicSnapshotFreshnessMonitorWithAlerts(
  options: {
    args?: readonly string[];
    env?: Readonly<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
    now?: Date;
    write?: (line: string) => void;
    notifier?: PublicationNotifier;
    alertStateMarkerPath?: string;
    checkImpl?: () => Promise<PublicationFreshnessResult>;
  } = {},
): Promise<number> {
  const args = options.args ?? process.argv.slice(2);
  if (args.length > 0) {
    return runPublicSnapshotFreshnessMonitor({
      args,
      env: options.env,
      fetchImpl: options.fetchImpl,
      now: options.now,
      write: options.write,
    });
  }

  const freshness = options.checkImpl
    ? await options.checkImpl()
    : await checkRemotePublicationFreshness({
        env: options.env,
        fetchImpl: options.fetchImpl,
        now: options.now,
      });
  (options.write ?? console.log)(JSON.stringify(freshness));

  try {
    await handlePublicationFreshnessAlert(freshness, {
      markerPath: options.alertStateMarkerPath,
      env: options.env,
      notifier: options.notifier,
    });
  } catch {
    // A desktop notification or state-file failure must never alter the
    // authoritative freshness result, its JSON line, or its exit code.
  }
  return publicationFreshnessExitCode(freshness);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  void runPublicSnapshotFreshnessMonitorWithAlerts()
    .then((code) => { process.exitCode = code; })
    .catch(() => {
      // The delegated checker owns all expected configuration/network failures.
      // This branch is limited to a programming/runtime failure before output.
      console.log(JSON.stringify({
        schema: 'naezip.public-snapshot-freshness.v1',
        status: 'critical',
        reason: 'internal-error',
        checkedAt: new Date().toISOString(),
        warningAfterHours: 36,
        criticalAfterHours: 48,
        publishedAt: null,
        releaseId: null,
        ageSeconds: null,
      }));
      process.exitCode = 2;
    });
}
