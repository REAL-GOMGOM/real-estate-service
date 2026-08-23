import { describe, expect, it, vi } from 'vitest';

import type { PublicSnapshotRetentionObjectStore } from '../object-store';
import { PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV } from '../publication-lock';
import {
  PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA,
  type PublicSnapshotRetentionPlan,
} from '../retention';
import {
  PUBLIC_SNAPSHOT_RETENTION_APPROVAL_ENV,
  PublicSnapshotRetentionCliUsageError,
  runPublicSnapshotRetentionCli,
  runPublicSnapshotRetentionMain,
  type PublicSnapshotRetentionCliDependencies,
} from '../../../scripts/retain-public-transactions';

const CURRENT_RELEASE_ID = '20260813T010203Z-aaaaaaaaaaaa';
const OLD_RELEASE_ID = '20260601T010203Z-bbbbbbbbbbbb';

function plan(overrides: Partial<PublicSnapshotRetentionPlan> = {}): PublicSnapshotRetentionPlan {
  return {
    schema: PUBLIC_SNAPSHOT_RETENTION_PLAN_SCHEMA,
    plannedAt: '2026-08-13T02:00:00.000Z',
    inventoryObjectCount: 62,
    inventoryByteLength: 2_000,
    currentReleaseId: CURRENT_RELEASE_ID,
    currentDiscoveryEtag: 'private-management-etag',
    discovery: {
      releaseId: CURRENT_RELEASE_ID,
      etag: 'private-management-etag',
      size: 1_000,
      uploadedAt: '2026-08-13T01:02:04.000Z',
    },
    protectedReleaseIds: [CURRENT_RELEASE_ID],
    deleteCandidates: [{
      releaseId: OLD_RELEASE_ID,
      kind: 'complete-release',
      manifestPathname: `public-transactions/v2/releases/${OLD_RELEASE_ID}/manifest.json`,
      manifestEtag: 'old-private-etag',
      publishedAt: '2026-06-01T01:02:03.000Z',
      payloadPathnames: [`public-transactions/v2/releases/${OLD_RELEASE_ID}/shards/00.json.gz`],
      objectCount: 2,
      byteLength: 1_000,
    }],
    ...overrides,
  };
}

function harness(options: {
  selectedPlan?: PublicSnapshotRetentionPlan;
  env?: Readonly<Record<string, string | undefined>>;
} = {}) {
  const messages: string[] = [];
  const store = {} as PublicSnapshotRetentionObjectStore;
  let insideLock = false;
  const createStore = vi.fn(() => {
    expect(insideLock).toBe(true);
    return store;
  });
  const collectPlan = vi.fn(async () => {
    expect(insideLock).toBe(true);
    return options.selectedPlan ?? plan();
  });
  const executePlan = vi.fn(async () => {
    expect(insideLock).toBe(true);
    return {
      manifestTombstones: [`public-transactions/v2/releases/${OLD_RELEASE_ID}/manifest.json`],
      payloadObjectsDeleted: [`public-transactions/v2/releases/${OLD_RELEASE_ID}/shards/00.json.gz`],
      completedReleaseIds: [OLD_RELEASE_ID],
    };
  });
  const withLock: PublicSnapshotRetentionCliDependencies['withLock'] = vi.fn(
    async (_env, operation) => {
      insideLock = true;
      try {
        return await operation();
      } finally {
        insideLock = false;
      }
    },
  );
  const dependencies: Partial<PublicSnapshotRetentionCliDependencies> = {
    env: options.env ?? {
      NAEZIP_SNAPSHOT_STORE: 'blob',
      NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN: 'must-never-be-logged',
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: 'https://private-store.example.test/',
    },
    createStore,
    collectPlan,
    executePlan,
    withLock,
    log: (message) => messages.push(message),
  };
  return {
    dependencies,
    messages,
    createStore,
    collectPlan,
    executePlan,
    withLock,
  };
}

describe('public snapshot retention CLI', () => {
  it('shows help without acquiring the lock or creating a store', async () => {
    const test = harness();

    await expect(runPublicSnapshotRetentionCli(['--help'], test.dependencies)).resolves.toBe(0);

    expect(test.messages.join('\n')).toContain('The default command performs a remote, read-only retention plan');
    expect(test.withLock).not.toHaveBeenCalled();
    expect(test.createStore).not.toHaveBeenCalled();
    expect(test.collectPlan).not.toHaveBeenCalled();
  });

  it('does not load the secure env file for help', async () => {
    const test = harness();
    const loadEnvironment = vi.fn(async () => ({ NAEZIP_SNAPSHOT_STORE: 'blob' }));

    await expect(runPublicSnapshotRetentionMain(['--help'], {
      loadEnvironment,
      cliDependencies: test.dependencies,
    })).resolves.toBe(0);

    expect(loadEnvironment).not.toHaveBeenCalled();
    expect(test.withLock).not.toHaveBeenCalled();
    expect(test.createStore).not.toHaveBeenCalled();
  });

  it('rejects malformed main arguments before loading the secure env file', async () => {
    const test = harness();
    const loadEnvironment = vi.fn(async () => ({ NAEZIP_SNAPSHOT_STORE: 'blob' }));

    await expect(runPublicSnapshotRetentionMain(['--unknown'], {
      loadEnvironment,
      cliDependencies: test.dependencies,
    })).rejects.toThrow('Unknown retention option');

    expect(loadEnvironment).not.toHaveBeenCalled();
    expect(test.withLock).not.toHaveBeenCalled();
    expect(test.createStore).not.toHaveBeenCalled();
  });

  it('uses the permission-checked environment for a normal plan', async () => {
    const test = harness();
    const loadedEnvironment = {
      NAEZIP_SNAPSHOT_STORE: 'blob',
      NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN: 'loaded-dedicated-token',
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL: 'https://loaded-store.example.test/',
    };
    const loadEnvironment = vi.fn(async () => loadedEnvironment);

    await expect(runPublicSnapshotRetentionMain([], {
      loadEnvironment,
      cliDependencies: test.dependencies,
    })).resolves.toBe(0);

    expect(loadEnvironment).toHaveBeenCalledOnce();
    expect(test.withLock).toHaveBeenCalledWith(loadedEnvironment, expect.any(Function));
    expect(test.createStore).toHaveBeenCalledWith(loadedEnvironment);
    expect(test.messages.join('\n')).not.toContain('loaded-dedicated-token');
    expect(test.messages.join('\n')).not.toContain('loaded-store.example.test');
  });

  it('rejects unknown or incomplete execution options before any access', async () => {
    const unknown = harness();
    await expect(runPublicSnapshotRetentionCli(
      ['--credential=must-never-be-echoed'],
      unknown.dependencies,
    )).rejects.toThrow(new PublicSnapshotRetentionCliUsageError('Unknown retention option'));
    expect(unknown.withLock).not.toHaveBeenCalled();
    expect(unknown.createStore).not.toHaveBeenCalled();

    const incomplete = harness();
    await expect(runPublicSnapshotRetentionCli(['--apply'], incomplete.dependencies))
      .rejects.toThrow('--apply requires --confirm-release');
    expect(incomplete.withLock).not.toHaveBeenCalled();
    expect(incomplete.createStore).not.toHaveBeenCalled();
  });

  it('is plan-only by default and logs only release identifiers and counts', async () => {
    const test = harness();

    await expect(runPublicSnapshotRetentionCli([], test.dependencies)).resolves.toBe(0);

    expect(test.withLock).toHaveBeenCalledOnce();
    expect(test.createStore).toHaveBeenCalledOnce();
    expect(test.collectPlan).toHaveBeenCalledOnce();
    expect(test.executePlan).not.toHaveBeenCalled();
    const output = test.messages.join('\n');
    expect(output).toContain(`currentRelease=${CURRENT_RELEASE_ID}`);
    expect(output).toContain(`candidate: release=${OLD_RELEASE_ID} objects=2`);
    expect(output).not.toContain('private-management-etag');
    expect(output).not.toContain('must-never-be-logged');
    expect(output).not.toContain('private-store.example.test');
  });

  it('strips any inherited publication-lock capability before acquiring the owner lock', async () => {
    const staleCapability = 'stale-child-capability-must-not-bypass-owner-lock';
    const test = harness({
      env: {
        NAEZIP_SNAPSHOT_STORE: 'blob',
        [PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV]: staleCapability,
      },
    });

    await expect(runPublicSnapshotRetentionCli([], test.dependencies)).resolves.toBe(0);

    const lockEnvironment = vi.mocked(test.withLock).mock.calls[0]?.[0];
    expect(lockEnvironment?.[PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV]).toBeUndefined();
    expect(test.messages.join('\n')).not.toContain(staleCapability);
  });

  it('reports an empty remote store as seed-eligible without executing deletion', async () => {
    const test = harness({
      selectedPlan: plan({
        inventoryObjectCount: 0,
        inventoryByteLength: 0,
        currentReleaseId: null,
        currentDiscoveryEtag: null,
        discovery: null,
        protectedReleaseIds: [],
        deleteCandidates: [],
      }),
    });

    await expect(runPublicSnapshotRetentionCli([], test.dependencies)).resolves.toBe(0);

    expect(test.messages).toEqual(['[public-snapshot-retention] plan: seedEligible=true']);
    expect(test.executePlan).not.toHaveBeenCalled();
  });

  it('collects a fresh plan before rejecting mismatched dual approval', async () => {
    const test = harness({
      env: {
        NAEZIP_SNAPSHOT_STORE: 'blob',
        [PUBLIC_SNAPSHOT_RETENTION_APPROVAL_ENV]: '20260812T010203Z-cccccccccccc',
      },
    });

    await expect(runPublicSnapshotRetentionCli(
      ['--apply', `--confirm-release=${CURRENT_RELEASE_ID}`],
      test.dependencies,
    )).rejects.toThrow('Both retention confirmations must match the freshly planned current release');

    expect(test.collectPlan).toHaveBeenCalledOnce();
    expect(test.executePlan).not.toHaveBeenCalled();
  });

  it('executes only when both confirmations match the freshly planned current release', async () => {
    const test = harness({
      env: {
        NAEZIP_SNAPSHOT_STORE: 'blob',
        [PUBLIC_SNAPSHOT_RETENTION_APPROVAL_ENV]: CURRENT_RELEASE_ID,
      },
    });

    await expect(runPublicSnapshotRetentionCli(
      ['--apply', `--confirm-release=${CURRENT_RELEASE_ID}`],
      test.dependencies,
    )).resolves.toBe(0);

    expect(test.collectPlan).toHaveBeenCalledOnce();
    expect(test.executePlan).toHaveBeenCalledOnce();
    expect(test.messages).toContain(
      `[public-snapshot-retention] completed: release=${OLD_RELEASE_ID}`,
    );
  });

  it('refuses apply against a seed-eligible empty store', async () => {
    const test = harness({
      env: {
        NAEZIP_SNAPSHOT_STORE: 'blob',
        [PUBLIC_SNAPSHOT_RETENTION_APPROVAL_ENV]: CURRENT_RELEASE_ID,
      },
      selectedPlan: plan({
        inventoryObjectCount: 0,
        inventoryByteLength: 0,
        currentReleaseId: null,
        currentDiscoveryEtag: null,
        discovery: null,
        protectedReleaseIds: [],
        deleteCandidates: [],
      }),
    });

    await expect(runPublicSnapshotRetentionCli(
      ['--apply', `--confirm-release=${CURRENT_RELEASE_ID}`],
      test.dependencies,
    )).rejects.toThrow('An empty store is seed-eligible');

    expect(test.collectPlan).toHaveBeenCalledOnce();
    expect(test.executePlan).not.toHaveBeenCalled();
  });
});
