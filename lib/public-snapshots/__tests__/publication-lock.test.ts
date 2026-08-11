import { access, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV,
  PublicSnapshotPublicationLockError,
  acquirePublicSnapshotPublicationLock,
  withPublicSnapshotPublicationLock,
} from '../publication-lock';

async function temporaryLockPath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-publication-lock-'));
  return path.join(directory, 'publisher.lock');
}

describe('public snapshot exclusive publication lock', () => {
  it('blocks a concurrent producer and permits the inherited publisher child', async () => {
    const lockPath = await temporaryLockPath();
    const owner = await acquirePublicSnapshotPublicationLock({
      env: { NAEZIP_SNAPSHOT_LOCK_PATH: lockPath },
      pid: 1234,
      processAlive: () => true,
    });
    await expect(acquirePublicSnapshotPublicationLock({
      env: { NAEZIP_SNAPSHOT_LOCK_PATH: lockPath },
      processAlive: () => true,
    })).rejects.toThrow('held by active pid 1234');

    const inherited = await acquirePublicSnapshotPublicationLock({
      env: {
        NAEZIP_SNAPSHOT_LOCK_PATH: lockPath,
        [PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV]: owner.token,
      },
    });
    expect(inherited.inherited).toBe(true);
    await inherited.release();
    await expect(access(lockPath)).resolves.toBeUndefined();
    await owner.release();
    await expect(access(lockPath)).rejects.toThrow();
  });

  it('releases in finally when the operation fails', async () => {
    const lockPath = await temporaryLockPath();
    await expect(withPublicSnapshotPublicationLock(
      { env: { NAEZIP_SNAPSHOT_LOCK_PATH: lockPath } },
      async () => { throw new Error('planned operation failure'); },
    )).rejects.toThrow('planned operation failure');
    await expect(access(lockPath)).rejects.toThrow();
  });

  it('never auto-reclaims even an old lock whose pid is dead', async () => {
    const lockPath = await temporaryLockPath();
    const owner = await acquirePublicSnapshotPublicationLock({
      env: { NAEZIP_SNAPSHOT_LOCK_PATH: lockPath },
      pid: 4321,
      now: () => new Date('2020-01-01T00:00:00.000Z'),
    });
    await expect(acquirePublicSnapshotPublicationLock({
      env: { NAEZIP_SNAPSHOT_LOCK_PATH: lockPath },
      processAlive: () => false,
    })).rejects.toBeInstanceOf(PublicSnapshotPublicationLockError);
    await expect(access(lockPath)).resolves.toBeUndefined();
    await owner.release();
  });
});
