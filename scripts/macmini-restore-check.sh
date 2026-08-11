#!/bin/bash
# 맥미니 백업 검증/복원 시험. 운영 DB를 만들거나 지우지 않으며, 실제 복원은 호출자가
# 준비한 이름이 naezip_restore_check_ 로 시작하는 빈 임시 DB에만 허용한다.
set -euo pipefail
umask 077

PG_BIN_DIR=${NAEZIP_PG_BIN_DIR:-/opt/homebrew/opt/postgresql@17/bin}
export PATH="$PG_BIN_DIR:/opt/homebrew/bin:$PATH"

BACKUP_ROOT=${NAEZIP_BACKUP_DIR:-}
REQUESTED_DIR=${1:-}

if [ -z "$REQUESTED_DIR" ]; then
  if [ -z "$BACKUP_ROOT" ] || [ ! -f "$BACKUP_ROOT/LATEST_SUCCESS" ]; then
    echo "[naezip-restore-check] 백업 디렉터리 인자 또는 NAEZIP_BACKUP_DIR/LATEST_SUCCESS가 필요합니다." >&2
    exit 2
  fi
  STAMP=$(sed -n '1p' "$BACKUP_ROOT/LATEST_SUCCESS")
  case "$STAMP" in
    *[!0-9A-Za-z._-]*|'')
      echo "[naezip-restore-check] LATEST_SUCCESS 값이 올바르지 않습니다." >&2
      exit 2
      ;;
  esac
  REQUESTED_DIR="$BACKUP_ROOT/$STAMP"
fi

if [ ! -d "$REQUESTED_DIR" ]; then
  echo "[naezip-restore-check] 백업 디렉터리를 찾을 수 없습니다: $REQUESTED_DIR" >&2
  exit 2
fi
if [ ! -f "$REQUESTED_DIR/SHA256SUMS" ] || [ ! -f "$REQUESTED_DIR/naezip-postgres.dump" ]; then
  echo "[naezip-restore-check] 필수 백업 파일이 없습니다: $REQUESTED_DIR" >&2
  exit 1
fi

for command_name in pg_restore shasum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[naezip-restore-check] 필수 명령을 찾을 수 없습니다: $command_name" >&2
    exit 2
  fi
done

echo "[naezip-restore-check] 체크섬 확인"
(
  cd "$REQUESTED_DIR"
  shasum -a 256 -c SHA256SUMS
)

echo "[naezip-restore-check] PostgreSQL archive 목차 확인"
pg_restore --list "$REQUESTED_DIR/naezip-postgres.dump" >/dev/null

if [ -f "$REQUESTED_DIR/realestate-alert.db" ]; then
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[naezip-restore-check] SQLite 백업이 있지만 sqlite3를 찾을 수 없습니다." >&2
    exit 2
  fi
  SQLITE_CHECK=$(sqlite3 -readonly "$REQUESTED_DIR/realestate-alert.db" 'PRAGMA quick_check;')
  if [ "$SQLITE_CHECK" != "ok" ]; then
    echo "[naezip-restore-check] SQLite 무결성 검사 실패: $SQLITE_CHECK" >&2
    exit 1
  fi
fi

RESTORE_URL=${NAEZIP_RESTORE_CHECK_DB_URL:-}
if [ -z "$RESTORE_URL" ]; then
  echo "[naezip-restore-check] archive 검증 완료 (실제 복원은 수행하지 않음)"
  echo "[naezip-restore-check] 주간 복원 시험은 NAEZIP_RESTORE_CHECK_DB_URL에 빈 임시 DB를 지정하세요."
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "[naezip-restore-check] 필수 명령을 찾을 수 없습니다: psql" >&2
  exit 2
fi

DB_NAME=$(psql -X --dbname="$RESTORE_URL" -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database()')
case "$DB_NAME" in
  naezip_restore_check_*) ;;
  *)
    echo "[naezip-restore-check] 임시 DB 이름은 naezip_restore_check_ 로 시작해야 합니다: $DB_NAME" >&2
    exit 2
    ;;
esac

USER_RELATIONS=$(psql -X --dbname="$RESTORE_URL" -v ON_ERROR_STOP=1 -Atqc \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')")
if [ "$USER_RELATIONS" != "0" ]; then
  echo "[naezip-restore-check] 임시 DB가 비어 있지 않습니다: $DB_NAME ($USER_RELATIONS relations)" >&2
  exit 2
fi

echo "[naezip-restore-check] 빈 임시 DB에 실제 복원 시작: $DB_NAME"
pg_restore --exit-on-error --no-owner --no-acl --dbname="$RESTORE_URL" \
  "$REQUESTED_DIR/naezip-postgres.dump"

RESTORED_TABLES=$(psql -X --dbname="$RESTORE_URL" -v ON_ERROR_STOP=1 -Atqc \
  "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')")
if [ "$RESTORED_TABLES" -le 0 ]; then
  echo "[naezip-restore-check] 복원 후 사용자 테이블이 없습니다." >&2
  exit 1
fi

echo "[naezip-restore-check] 실제 복원 검증 완료: $DB_NAME, tables=$RESTORED_TABLES"
echo "[naezip-restore-check] 이 스크립트는 임시 DB를 삭제하지 않습니다. 확인 후 운영자가 정리하세요."
