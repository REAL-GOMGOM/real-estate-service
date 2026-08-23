import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PUBLICATION_FRESHNESS_CRITICAL_HOURS,
  PUBLICATION_FRESHNESS_SCHEMA,
  PUBLICATION_FRESHNESS_WARNING_HOURS,
  checkRemotePublicationFreshness,
  publicationFreshnessExitCode,
  type PublicationFreshnessReason,
  type PublicationFreshnessResult,
} from '../lib/public-snapshots/publication-observability';

const HELP = `
Usage: node --import tsx scripts/check-public-snapshot-freshness.ts

Reads NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL, fetches the strict public
discovery manifest, and writes exactly one JSON line to stdout.

Exit codes: 0=healthy (<36h), 1=warning (36h to <48h), 2=critical/unavailable (>=48h).
`;

function machineFailure(
  reason: Extract<PublicationFreshnessReason, 'invalid-arguments' | 'internal-error'>,
  now: Date,
): PublicationFreshnessResult {
  return {
    schema: PUBLICATION_FRESHNESS_SCHEMA,
    status: 'critical',
    reason,
    checkedAt: now.toISOString(),
    warningAfterHours: PUBLICATION_FRESHNESS_WARNING_HOURS,
    criticalAfterHours: PUBLICATION_FRESHNESS_CRITICAL_HOURS,
    publishedAt: null,
    releaseId: null,
    ageSeconds: null,
  };
}

export async function runPublicSnapshotFreshnessMonitor(
  options: {
    args?: readonly string[];
    env?: Readonly<Record<string, string | undefined>>;
    fetchImpl?: typeof fetch;
    now?: Date;
    write?: (line: string) => void;
  } = {},
): Promise<number> {
  const args = options.args ?? process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    (options.write ?? console.log)(HELP.trim());
    return 0;
  }
  if (args.length > 0) {
    const invalid = machineFailure('invalid-arguments', options.now ?? new Date());
    (options.write ?? console.log)(JSON.stringify(invalid));
    return 2;
  }

  const result = await checkRemotePublicationFreshness({
    env: options.env,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  (options.write ?? console.log)(JSON.stringify(result));
  return publicationFreshnessExitCode(result);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  void runPublicSnapshotFreshnessMonitor()
    .then((code) => { process.exitCode = code; })
    .catch(() => {
      console.log(JSON.stringify(machineFailure('internal-error', new Date())));
      process.exitCode = 2;
    });
}
