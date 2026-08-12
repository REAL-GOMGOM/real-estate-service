import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse as parseDotenv } from 'dotenv';

import {
  MACMINI_SYNC_HEALTH_SCHEMA,
  defaultMacMiniSyncHealthMarkerPath,
  writeMacMiniSyncHealthMarker,
} from '../lib/public-snapshots/publish-health';
import {
  PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV,
  withPublicSnapshotPublicationLock,
} from '../lib/public-snapshots/publication-lock';

const HELP = `
Usage: npx tsx scripts/run-local-sync-and-publish.ts [--dry-run] [--allow-stale-local]

Runs macmini-sync first, atomically records its exit status, and invokes the public
snapshot publisher only when sync exits 0 (healthy) or 2 (Neon-only degraded).
Before sync starts, an exit 1 marker invalidates any prior healthy marker. Exit 1,
a signal, a reboot, or a launch failure therefore blocks publish fail-closed.
Loads .env.local (or NAEZIP_ENV_FILE) once; already-exported variables take priority.

--dry-run            Force only the publisher to use its local object-store sink.
                     MOLIT fetches and local PostgreSQL sync writes still run.
--allow-stale-local   MANUAL EMERGENCY OVERRIDE passed to the publisher. It must not
                      be used by launchd or routine automation; production also requires
                      an explicit NAEZIP_SNAPSHOT_SOURCE_AT.
`;

interface SpawnResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

type RunChild = (
  command: string,
  args: readonly string[],
  childEnv: NodeJS.ProcessEnv,
) => Promise<SpawnResult>;

const MAX_ENV_FILE_BYTES = 1024 * 1024;
export const SNAPSHOT_SOURCE_AT_ENV = 'NAEZIP_SNAPSHOT_SOURCE_AT';

export function kstCalendarDate(instant: Date): string {
  return new Date(instant.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

export async function loadWrapperEnvironment(
  options: {
    baseEnv?: Readonly<Record<string, string | undefined>>;
    cwd?: string;
  } = {},
): Promise<NodeJS.ProcessEnv> {
  const baseEnv = options.baseEnv ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const configuredPath = baseEnv.NAEZIP_ENV_FILE?.trim();
  const envFilePath = path.resolve(cwd, configuredPath || '.env.local');
  let fileStat;
  try {
    // stat follows a symbolic link and validates the actual target before any
    // potentially-secret bytes are read.
    fileStat = await stat(envFilePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`환경파일을 찾을 수 없습니다: ${envFilePath}`);
    }
    throw new Error(`환경파일 상태를 확인할 수 없습니다: ${envFilePath}`);
  }
  if (!fileStat.isFile()) {
    throw new Error(`환경파일은 regular file이어야 합니다: ${envFilePath}`);
  }
  if ((fileStat.mode & 0o077) !== 0) {
    throw new Error(`환경파일 권한은 0600이어야 합니다: ${envFilePath}`);
  }
  let raw: string;
  try {
    raw = await readFile(envFilePath, 'utf8');
  } catch {
    throw new Error(`환경파일을 읽을 수 없습니다: ${envFilePath}`);
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_ENV_FILE_BYTES) {
    throw new Error(`환경파일이 안전 한도 1MiB를 초과했습니다: ${envFilePath}`);
  }
  let parsed: Record<string, string>;
  try {
    parsed = parseDotenv(raw);
  } catch {
    throw new Error(`환경파일 형식이 올바르지 않습니다: ${envFilePath}`);
  }

  // Environment explicitly supplied by launchd/the operator wins over the file.
  // macmini-sync's legacy dotenv config uses override=false, so these inherited
  // child variables also win over its old hard-coded canonical .env.local path.
  const existing = Object.fromEntries(
    Object.entries(baseEnv).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  return { ...parsed, ...existing } as NodeJS.ProcessEnv;
}

function run(command: string, args: readonly string[], childEnv: NodeJS.ProcessEnv): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: process.cwd(),
      env: childEnv,
      shell: false,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
}

export function normalizedSyncExitCode(result: SpawnResult): 0 | 1 | 2 {
  return result.signal === null && (result.code === 0 || result.code === 2)
    ? result.code
    : 1;
}

export async function runSyncAndPublish(
  options: {
    publisherArgs?: readonly string[];
    runImpl?: RunChild;
    now?: () => Date;
    markerPath?: string;
    tsxPath?: string;
    childEnv?: NodeJS.ProcessEnv;
  } = {},
): Promise<number> {
  const runImpl = options.runImpl ?? run;
  const childEnv = options.childEnv ?? process.env;
  const now = options.now ?? (() => new Date());
  const tsxPath = options.tsxPath ?? path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
  const markerPath = options.markerPath ?? defaultMacMiniSyncHealthMarkerPath(childEnv);
  const syncStartedAt = now();

  // Fail closed before sync mutates any local table. If this wrapper is killed or
  // the Mac reboots mid-sync, a standalone publisher sees exit 1 instead of the
  // previous healthy marker and cannot publish a partially updated local ledger.
  await writeMacMiniSyncHealthMarker(markerPath, {
    schema: MACMINI_SYNC_HEALTH_SCHEMA,
    completedAt: syncStartedAt.toISOString(),
    exitCode: 1,
  });

  let syncResult: SpawnResult;
  try {
    syncResult = await runImpl(tsxPath, ['scripts/macmini-sync.ts'], childEnv);
  } catch (error) {
    syncResult = { code: 1, signal: null };
    console.error('[sync-and-publish] sync 프로세스를 시작하지 못했습니다:', error instanceof Error ? error.message : error);
  }
  const syncCompletedAt = now();
  let syncExitCode = normalizedSyncExitCode(syncResult);
  if (kstCalendarDate(syncStartedAt) !== kstCalendarDate(syncCompletedAt)) {
    syncExitCode = 1;
    console.error(
      '[sync-and-publish] sync가 KST 날짜 경계를 넘었습니다 — 월 범위 증명을 위해 publish를 차단합니다.',
    );
  }
  await writeMacMiniSyncHealthMarker(markerPath, {
    schema: MACMINI_SYNC_HEALTH_SCHEMA,
    completedAt: syncCompletedAt.toISOString(),
    exitCode: syncExitCode,
  });
  if (syncExitCode === 1) {
    console.error('[sync-and-publish] sync exit 1/source/local failure — public snapshot publish를 차단했습니다.');
    return 1;
  }

  const publisherEnv = {
    ...childEnv,
    [SNAPSHOT_SOURCE_AT_ENV]: syncCompletedAt.toISOString(),
  } as NodeJS.ProcessEnv;
  const publisherResult = await runImpl(tsxPath, [
    'scripts/publish-public-transactions.ts',
    ...(options.publisherArgs ?? []),
  ], publisherEnv);
  if (publisherResult.signal !== null || publisherResult.code !== 0) {
    console.error('[sync-and-publish] public snapshot publisher가 실패했습니다.');
    return 1;
  }
  return 0;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP.trim());
    return 0;
  }
  const allowed = new Set(['--dry-run', '--allow-stale-local']);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) {
    console.error(`[sync-and-publish] 알 수 없는 옵션: ${unknown.join(', ')}`);
    console.error(HELP.trim());
    return 1;
  }
  if (args.includes('--allow-stale-local')) {
    console.warn('[sync-and-publish] 경고: --allow-stale-local은 수동 비상 우회입니다. 정기 자동화에 사용하지 마세요.');
  }
  const childEnv = await loadWrapperEnvironment();
  // Only this wrapper may mint the inherited child capability. Ignore any
  // stale/operator-supplied token from an env file when acquiring the owner lock.
  const wrapperEnv = { ...childEnv } as NodeJS.ProcessEnv;
  delete wrapperEnv[PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV];
  return withPublicSnapshotPublicationLock({ env: wrapperEnv }, async (lock) => {
    const lockedChildEnv = {
      ...wrapperEnv,
      [PUBLIC_SNAPSHOT_LOCK_TOKEN_ENV]: lock.token,
    } as NodeJS.ProcessEnv;
    return runSyncAndPublish({ publisherArgs: args, childEnv: lockedChildEnv });
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  void main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error('[sync-and-publish] 치명 오류:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
