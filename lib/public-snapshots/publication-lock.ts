import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_SNAPSHOT_LOCK_SCHEMA = 'naezip.public-snapshot-lock.v1' as const;
export const PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV = 'NAEZIP_SNAPSHOT_LOCK_TOKEN' as const;
const LOCK_OWNER_FILE = 'owner.json';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface PublicSnapshotLockOwner {
  schema: typeof PUBLIC_SNAPSHOT_LOCK_SCHEMA;
  pid: number;
  startedAt: string;
  token: string;
}

export interface PublicSnapshotPublicationLock {
  lockPath: string;
  token: string;
  inherited: boolean;
  release(): Promise<void>;
}

export class PublicSnapshotPublicationLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicSnapshotPublicationLockError';
  }
}

function lockPathFromEnvironment(env: Readonly<Record<string, string | undefined>>): string {
  const configured = env.NAEZIP_SNAPSHOT_LOCK_PATH?.trim();
  return path.resolve(REPOSITORY_ROOT, configured || '.local/public-snapshot-publication.lock');
}

function parseOwner(raw: string): PublicSnapshotLockOwner {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PublicSnapshotPublicationLockError('publication lock metadata is unreadable; recover it manually');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PublicSnapshotPublicationLockError('publication lock metadata is invalid; recover it manually');
  }
  const owner = value as Record<string, unknown>;
  if (owner.schema !== PUBLIC_SNAPSHOT_LOCK_SCHEMA
    || !Number.isSafeInteger(owner.pid) || Number(owner.pid) <= 0
    || typeof owner.startedAt !== 'string' || !Number.isFinite(Date.parse(owner.startedAt))
    || typeof owner.token !== 'string' || owner.token.length < 16) {
    throw new PublicSnapshotPublicationLockError('publication lock metadata is invalid; recover it manually');
  }
  return owner as unknown as PublicSnapshotLockOwner;
}

async function readOwner(lockPath: string): Promise<PublicSnapshotLockOwner> {
  try {
    return parseOwner(await readFile(path.join(lockPath, LOCK_OWNER_FILE), 'utf8'));
  } catch (error) {
    if (error instanceof PublicSnapshotPublicationLockError) throw error;
    throw new PublicSnapshotPublicationLockError(
      `publication lock exists without readable metadata at ${lockPath}; recover it manually`,
    );
  }
}

function defaultProcessAlive(pid: number): boolean | null {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false;
    // EPERM and unknown errors cannot prove the owner is dead, so fail closed.
    return null;
  }
}

export async function acquirePublicSnapshotPublicationLock(
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    pid?: number;
    now?: () => Date;
    processAlive?: (pid: number) => boolean | null;
  } = {},
): Promise<PublicSnapshotPublicationLock> {
  const env = options.env ?? process.env;
  const lockPath = lockPathFromEnvironment(env);
  const inheritedToken = env[PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV]?.trim();
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });

  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
    const owner = await readOwner(lockPath);
    if (inheritedToken && inheritedToken === owner.token) {
      return {
        lockPath,
        token: owner.token,
        inherited: true,
        release: async () => undefined,
      };
    }
    const alive = (options.processAlive ?? defaultProcessAlive)(owner.pid);
    if (alive === true) {
      throw new PublicSnapshotPublicationLockError(
        `publication lock is held by active pid ${owner.pid} since ${owner.startedAt}`,
      );
    }
    throw new PublicSnapshotPublicationLockError(
      `orphaned or unverifiable publication lock at ${lockPath}; verify no producer is running, then remove it manually`,
    );
  }

  const owner: PublicSnapshotLockOwner = {
    schema: PUBLIC_SNAPSHOT_LOCK_SCHEMA,
    pid: options.pid ?? process.pid,
    startedAt: (options.now ?? (() => new Date()))().toISOString(),
    token: randomUUID(),
  };
  try {
    await writeFile(
      path.join(lockPath, LOCK_OWNER_FILE),
      `${JSON.stringify(owner)}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o600 },
    );
  } catch (error) {
    await rmdir(lockPath).catch(() => undefined);
    throw error;
  }

  let released = false;
  return {
    lockPath,
    token: owner.token,
    inherited: false,
    release: async () => {
      if (released) return;
      const current = await readOwner(lockPath);
      if (current.token !== owner.token) {
        throw new PublicSnapshotPublicationLockError('publication lock ownership changed; refusing to remove it');
      }
      await unlink(path.join(lockPath, LOCK_OWNER_FILE));
      await rmdir(lockPath);
      released = true;
    },
  };
}

export async function withPublicSnapshotPublicationLock<Result>(
  options: Parameters<typeof acquirePublicSnapshotPublicationLock>[0],
  operation: (lock: PublicSnapshotPublicationLock) => Promise<Result>,
): Promise<Result> {
  const lock = await acquirePublicSnapshotPublicationLock(options);
  try {
    return await operation(lock);
  } finally {
    await lock.release();
  }
}
