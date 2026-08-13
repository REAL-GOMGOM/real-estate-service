import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createPublicSnapshotRetentionStoreFromEnv,
  type PublicSnapshotRetentionObjectStore,
} from '../lib/public-snapshots/object-store';
import {
  PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV,
  withPublicSnapshotPublicationLock,
} from '../lib/public-snapshots/publication-lock';
import {
  collectAndPlanPublicSnapshotRetention,
  executePublicSnapshotRetention,
  type PublicSnapshotRetentionExecutionResult,
  type PublicSnapshotRetentionPlan,
} from '../lib/public-snapshots/retention';
import { loadWrapperEnvironment } from './run-local-sync-and-publish';

export const PUBLIC_SNAPSHOT_RETENTION_APPROVAL_ENV = 'NAEZIP_SNAPSHOT_RETENTION_APPROVAL' as const;

const RELEASE_ID_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;

export const PUBLIC_SNAPSHOT_RETENTION_HELP = `
Usage: node --import tsx scripts/retain-public-transactions.ts
       node --import tsx scripts/retain-public-transactions.ts \\
         --apply --confirm-release=<current-release-id>

The default command performs a remote, read-only retention plan. It may list,
HEAD, and read Blob objects, but it never deletes them.

--apply                         Execute the freshly collected plan.
--confirm-release=<release-id>  Required with --apply. Must equal the current
                                 discovery release and the separate
                                 NAEZIP_SNAPSHOT_RETENTION_APPROVAL value.
--help, -h                      Show this help without accessing Blob or the lock.

Retention supports only explicit NAEZIP_SNAPSHOT_STORE=blob with the dedicated
snapshot token and public Blob origin. Local dry-run and legacy R2 are refused.
`;

export class PublicSnapshotRetentionCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicSnapshotRetentionCliUsageError';
  }
}

export interface PublicSnapshotRetentionCliArguments {
  help: boolean;
  apply: boolean;
  confirmReleaseId: string | null;
}

export function parsePublicSnapshotRetentionCliArguments(
  args: readonly string[],
): PublicSnapshotRetentionCliArguments {
  let help = false;
  let apply = false;
  let confirmReleaseId: string | null = null;

  for (const argument of args) {
    if (argument === '--help' || argument === '-h') {
      if (help) throw new PublicSnapshotRetentionCliUsageError('Duplicate help option');
      help = true;
      continue;
    }
    if (argument === '--apply') {
      if (apply) throw new PublicSnapshotRetentionCliUsageError('Duplicate apply option');
      apply = true;
      continue;
    }
    if (argument.startsWith('--confirm-release=')) {
      if (confirmReleaseId !== null) {
        throw new PublicSnapshotRetentionCliUsageError('Duplicate release confirmation option');
      }
      const value = argument.slice('--confirm-release='.length);
      if (!RELEASE_ID_PATTERN.test(value)) {
        throw new PublicSnapshotRetentionCliUsageError('Release confirmation has an invalid format');
      }
      confirmReleaseId = value;
      continue;
    }
    // Never echo unknown input: it might contain a credential pasted by mistake.
    throw new PublicSnapshotRetentionCliUsageError('Unknown retention option');
  }

  if (help && (apply || confirmReleaseId !== null)) {
    throw new PublicSnapshotRetentionCliUsageError('Help cannot be combined with execution options');
  }
  if (!apply && confirmReleaseId !== null) {
    throw new PublicSnapshotRetentionCliUsageError('--confirm-release requires --apply');
  }
  if (apply && confirmReleaseId === null) {
    throw new PublicSnapshotRetentionCliUsageError('--apply requires --confirm-release');
  }
  return { help, apply, confirmReleaseId };
}

type RetentionLockRunner = <Result>(
  env: Readonly<Record<string, string | undefined>>,
  operation: () => Promise<Result>,
) => Promise<Result>;

export interface PublicSnapshotRetentionCliDependencies {
  env: Readonly<Record<string, string | undefined>>;
  createStore: (
    env: Readonly<Record<string, string | undefined>>,
  ) => PublicSnapshotRetentionObjectStore;
  collectPlan: (
    store: PublicSnapshotRetentionObjectStore,
  ) => Promise<PublicSnapshotRetentionPlan>;
  executePlan: (
    store: PublicSnapshotRetentionObjectStore,
    plan: PublicSnapshotRetentionPlan,
  ) => Promise<PublicSnapshotRetentionExecutionResult>;
  withLock: RetentionLockRunner;
  log: (message: string) => void;
}

function defaultDependencies(): PublicSnapshotRetentionCliDependencies {
  return {
    env: process.env,
    createStore: createPublicSnapshotRetentionStoreFromEnv,
    collectPlan: collectAndPlanPublicSnapshotRetention,
    executePlan: executePublicSnapshotRetention,
    withLock: (env, operation) => withPublicSnapshotPublicationLock({ env }, operation),
    log: console.log,
  };
}

function logPlan(
  plan: PublicSnapshotRetentionPlan,
  log: (message: string) => void,
): void {
  if (plan.currentReleaseId === null) {
    log('[public-snapshot-retention] plan: seedEligible=true');
    return;
  }
  const deleteObjectCount = plan.deleteCandidates.reduce(
    (total, candidate) => total + candidate.objectCount,
    0,
  );
  log(
    `[public-snapshot-retention] plan: currentRelease=${plan.currentReleaseId}`
      + ` inventoryObjects=${plan.inventoryObjectCount}`
      + ` protectedReleases=${plan.protectedReleaseIds.length}`
      + ` deleteReleases=${plan.deleteCandidates.length}`
      + ` deleteObjects=${deleteObjectCount}`,
  );
  for (const candidate of plan.deleteCandidates) {
    log(
      `[public-snapshot-retention] candidate: release=${candidate.releaseId}`
        + ` objects=${candidate.objectCount}`,
    );
  }
}

function assertApplyApproval(
  parsed: PublicSnapshotRetentionCliArguments,
  plan: PublicSnapshotRetentionPlan,
  env: Readonly<Record<string, string | undefined>>,
): string {
  if (!parsed.apply || !parsed.confirmReleaseId) {
    throw new PublicSnapshotRetentionCliUsageError('Retention apply approval is incomplete');
  }
  if (plan.currentReleaseId === null) {
    throw new PublicSnapshotRetentionCliUsageError(
      'An empty store is seed-eligible and has no retention deletion to approve',
    );
  }
  const environmentApproval = env[PUBLIC_SNAPSHOT_RETENTION_APPROVAL_ENV]?.trim();
  if (parsed.confirmReleaseId !== plan.currentReleaseId
    || environmentApproval !== plan.currentReleaseId) {
    throw new PublicSnapshotRetentionCliUsageError(
      'Both retention confirmations must match the freshly planned current release',
    );
  }
  return plan.currentReleaseId;
}

/**
 * Runs one retention plan/apply cycle. Parsing finishes before any lock or
 * remote-store access; every remote operation then runs under the publisher's
 * shared exclusive lock.
 */
export async function runPublicSnapshotRetentionCli(
  args: readonly string[],
  overrides: Partial<PublicSnapshotRetentionCliDependencies> = {},
): Promise<number> {
  const parsed = parsePublicSnapshotRetentionCliArguments(args);
  const dependencies = { ...defaultDependencies(), ...overrides };
  if (parsed.help) {
    dependencies.log(PUBLIC_SNAPSHOT_RETENTION_HELP.trim());
    return 0;
  }

  // This standalone command must acquire the owner lock itself. Never honor an
  // inherited child capability copied into a shell or env file, because that
  // could let retention overlap an active sync/publisher process.
  const lockEnvironment = { ...dependencies.env };
  delete lockEnvironment[PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV];
  return dependencies.withLock(lockEnvironment, async () => {
    const store = dependencies.createStore(dependencies.env);
    // Apply never consumes a saved plan. Collection happens immediately before
    // approval comparison, and the executor independently rechecks discovery.
    const plan = await dependencies.collectPlan(store);
    logPlan(plan, dependencies.log);
    if (!parsed.apply) return 0;

    const approvedCurrentReleaseId = assertApplyApproval(parsed, plan, dependencies.env);
    const result = await dependencies.executePlan(store, plan);
    dependencies.log(
      `[public-snapshot-retention] applied: approvedCurrentRelease=${approvedCurrentReleaseId}`
        + ` completedReleases=${result.completedReleaseIds.length}`
        + ` manifestTombstones=${result.manifestTombstones.length}`
        + ` payloadObjects=${result.payloadObjectsDeleted.length}`,
    );
    for (const releaseId of result.completedReleaseIds) {
      dependencies.log(`[public-snapshot-retention] completed: release=${releaseId}`);
    }
    return 0;
  });
}

export interface PublicSnapshotRetentionMainDependencies {
  loadEnvironment: () => Promise<Readonly<Record<string, string | undefined>>>;
  cliDependencies: Partial<PublicSnapshotRetentionCliDependencies>;
}

/**
 * Loads the same permission-checked env file as the sync/publish wrapper, but
 * only after argument validation. Help and malformed commands perform no file,
 * lock, or Blob access.
 */
export async function runPublicSnapshotRetentionMain(
  args: readonly string[],
  overrides: Partial<PublicSnapshotRetentionMainDependencies> = {},
): Promise<number> {
  const parsed = parsePublicSnapshotRetentionCliArguments(args);
  const cliDependencies = overrides.cliDependencies ?? {};
  if (parsed.help) return runPublicSnapshotRetentionCli(args, cliDependencies);

  const env = await (overrides.loadEnvironment ?? loadWrapperEnvironment)();
  return runPublicSnapshotRetentionCli(args, { ...cliDependencies, env });
}

async function main(): Promise<number> {
  try {
    return await runPublicSnapshotRetentionMain(process.argv.slice(2));
  } catch (error) {
    console.error(
      '[public-snapshot-retention] failed:',
      error instanceof Error ? error.message : 'unknown error',
    );
    if (error instanceof PublicSnapshotRetentionCliUsageError) {
      console.error(PUBLIC_SNAPSHOT_RETENTION_HELP.trim());
    }
    return 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  void main().then((code) => { process.exitCode = code; });
}
