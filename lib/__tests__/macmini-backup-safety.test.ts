import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const backupScript = path.join(repoRoot, 'scripts', 'macmini-backup.sh');
const restoreScript = path.join(repoRoot, 'scripts', 'macmini-restore-check.sh');
const launchdExample = path.join(
  repoRoot,
  'scripts',
  'launchd',
  'com.gomgom.naezip-backup.plist.example',
);
const tempRoots: string[] = [];

function writeExecutable(file: string, body: string): void {
  fs.writeFileSync(file, `#!/bin/sh\nset -eu\n${body}`);
  fs.chmodSync(file, 0o755);
}

function makeFixture(): { root: string; backupRoot: string; fakeBin: string; sqlite: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'naezip-backup-test-'));
  tempRoots.push(root);
  const backupRoot = path.join(root, 'backups');
  const fakeBin = path.join(root, 'bin');
  const sqlite = path.join(root, 'bot.db');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(sqlite, 'sqlite-fixture');

  writeExecutable(path.join(fakeBin, 'pg_dump'), `
if [ "\${FAKE_PG_DUMP_FAIL:-0}" = "1" ]; then exit 9; fi
output=""
for arg in "$@"; do
  case "$arg" in --file=*) output=\${arg#--file=} ;; esac
done
[ -n "$output" ]
printf 'fake-postgres-archive\n' > "$output"
`);
  writeExecutable(path.join(fakeBin, 'pg_restore'), `
if [ "\${1:-}" = "--list" ]; then
  printf '; fake archive toc\n'
  exit 0
fi
exit 0
`);
  writeExecutable(path.join(fakeBin, 'sqlite3'), `
db=""
query=""
for arg in "$@"; do
  [ "$arg" = "-readonly" ] && continue
  if [ -z "$db" ]; then db="$arg"; else query="$arg"; fi
done
case "$query" in
  .backup*)
    dest=$(printf '%s' "$query" | sed "s/^\\.backup '//; s/'$//")
    cp "$db" "$dest"
    ;;
  *quick_check*) printf 'ok\n' ;;
  *) exit 2 ;;
esac
`);
  return { root, backupRoot, fakeBin, sqlite };
}

function runScript(
  script: string,
  fixture: ReturnType<typeof makeFixture>,
  stamp: string,
  extraEnv: Record<string, string> = {},
) {
  return spawnSync('/bin/bash', [script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.fakeBin}:${process.env.PATH ?? ''}`,
      NAEZIP_PG_BIN_DIR: fixture.fakeBin,
      NAEZIP_BACKUP_DIR: fixture.backupRoot,
      NAEZIP_BOT_SQLITE_PATH: fixture.sqlite,
      NAEZIP_BACKUP_STAMP: stamp,
      ...extraEnv,
    },
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('macmini backup 안전성', () => {
  it('검증된 디렉터리만 발행하고 LATEST_SUCCESS를 갱신한다', () => {
    const fixture = makeFixture();
    const stamp = '20260811-030000';
    const result = runScript(backupScript, fixture, stamp);

    expect(result.status, result.stderr).toBe(0);
    const finalDir = path.join(fixture.backupRoot, stamp);
    expect(fs.readFileSync(path.join(fixture.backupRoot, 'LATEST_SUCCESS'), 'utf8').trim()).toBe(stamp);
    expect(fs.existsSync(path.join(finalDir, 'naezip-postgres.dump'))).toBe(true);
    expect(fs.existsSync(path.join(finalDir, 'realestate-alert.db'))).toBe(true);
    expect(fs.readFileSync(path.join(finalDir, 'SHA256SUMS'), 'utf8')).toContain('naezip-postgres.dump');
    expect(fs.readdirSync(fixture.backupRoot).some((name) => name.startsWith('.partial-'))).toBe(false);
  });

  it('다음 백업이 실패해도 마지막 성공본과 포인터를 보존한다', () => {
    const fixture = makeFixture();
    const goodStamp = '20260811-030001';
    const failedStamp = '20260811-030002';
    expect(runScript(backupScript, fixture, goodStamp).status).toBe(0);

    const failed = runScript(backupScript, fixture, failedStamp, { FAKE_PG_DUMP_FAIL: '1' });

    expect(failed.status).not.toBe(0);
    expect(fs.readFileSync(path.join(fixture.backupRoot, 'LATEST_SUCCESS'), 'utf8').trim()).toBe(goodStamp);
    expect(fs.existsSync(path.join(fixture.backupRoot, goodStamp, 'naezip-postgres.dump'))).toBe(true);
    expect(fs.existsSync(path.join(fixture.backupRoot, failedStamp))).toBe(false);
    expect(fs.readdirSync(fixture.backupRoot).some((name) => name.startsWith('.partial-'))).toBe(false);
  });

  it('필수 외장 볼륨이 독립 마운트가 아니면 백업을 거부한다', () => {
    const fixture = makeFixture();
    const result = runScript(backupScript, fixture, '20260811-030004', {
      NAEZIP_REQUIRED_VOLUME: fixture.root,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('독립된 마운트 지점이 아닙니다');
    expect(fs.existsSync(fixture.backupRoot)).toBe(false);
  });

  it('복원 스크립트가 마지막 성공본의 체크섬·archive·SQLite를 검증한다', () => {
    const fixture = makeFixture();
    const stamp = '20260811-030003';
    expect(runScript(backupScript, fixture, stamp).status).toBe(0);

    const result = runScript(restoreScript, fixture, stamp);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('archive 검증 완료');
    expect(result.stdout).toContain('실제 복원은 수행하지 않음');
  });

  it('launchd 예시는 외장 경로·SQLite·로그를 명시하고 비밀번호를 포함하지 않는다', () => {
    const plist = fs.readFileSync(launchdExample, 'utf8');
    expect(plist).toContain('com.gomgom.naezip-backup');
    expect(plist).toContain('NAEZIP_BACKUP_DIR');
    expect(plist).toContain('/Volumes/CHANGE_ME/naezip-backups');
    expect(plist).toContain('NAEZIP_REQUIRED_VOLUME');
    expect(plist).toContain('NAEZIP_BOT_SQLITE_PATH');
    expect(plist).toContain('naezip-backup-error.log');
    expect(plist).not.toContain('PGPASSWORD');
  });
});
