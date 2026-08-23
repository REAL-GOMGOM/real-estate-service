#!/bin/bash
# 맥미니 원장 일관 백업. 기존 백업은 삭제하지 않으며, 새 백업 검증이 끝난 뒤에만
# .partial 디렉터리를 최종 디렉터리로 원자적으로 이름 변경한다.
set -euo pipefail
umask 077

PG_BIN_DIR=${NAEZIP_PG_BIN_DIR:-/opt/homebrew/opt/postgresql@17/bin}
export PATH="$PG_BIN_DIR:/opt/homebrew/bin:$PATH"

mount_point_for_path() {
  target=$1
  if mount_point=$(stat -f '%m' "$target" 2>/dev/null); then
    printf '%s\n' "$mount_point"
  elif command -v findmnt >/dev/null 2>&1; then
    findmnt -n -o TARGET --target "$target"
  else
    return 1
  fi
}

BACKUP_ROOT=${NAEZIP_BACKUP_DIR:-}
if [ -z "$BACKUP_ROOT" ]; then
  echo "[naezip-backup] NAEZIP_BACKUP_DIR을 외장 또는 암호화 백업 경로로 설정하세요." >&2
  exit 2
fi
case "$BACKUP_ROOT" in
  /*) ;;
  *)
    echo "[naezip-backup] 백업 경로는 절대 경로여야 합니다: $BACKUP_ROOT" >&2
    exit 2
    ;;
esac

REQUIRED_VOLUME=${NAEZIP_REQUIRED_VOLUME:-}
if [ -n "$REQUIRED_VOLUME" ]; then
  if [ ! -d "$REQUIRED_VOLUME" ]; then
    echo "[naezip-backup] 필수 백업 볼륨이 마운트되지 않았습니다: $REQUIRED_VOLUME" >&2
    exit 2
  fi
  REQUIRED_VOLUME=$(cd "$REQUIRED_VOLUME" && pwd -P)
  VOLUME_MOUNT_POINT=$(mount_point_for_path "$REQUIRED_VOLUME" || true)
  if [ -z "$VOLUME_MOUNT_POINT" ] || [ "$VOLUME_MOUNT_POINT" != "$REQUIRED_VOLUME" ]; then
    echo "[naezip-backup] 필수 백업 볼륨이 독립된 마운트 지점이 아닙니다: $REQUIRED_VOLUME" >&2
    exit 2
  fi
fi

mkdir -p "$BACKUP_ROOT"
BACKUP_ROOT=$(cd "$BACKUP_ROOT" && pwd -P)
if [ "$BACKUP_ROOT" = "/" ]; then
  echo "[naezip-backup] 파일시스템 루트는 백업 경로로 사용할 수 없습니다." >&2
  exit 2
fi
if [ -n "$REQUIRED_VOLUME" ]; then
  BACKUP_MOUNT_POINT=$(mount_point_for_path "$BACKUP_ROOT" || true)
  case "$BACKUP_ROOT/" in
    "$REQUIRED_VOLUME"/*) ;;
    *)
      echo "[naezip-backup] 백업 경로가 필수 볼륨 안에 없습니다: $BACKUP_ROOT" >&2
      exit 2
      ;;
  esac
  if [ "$BACKUP_MOUNT_POINT" != "$REQUIRED_VOLUME" ]; then
    echo "[naezip-backup] 백업 경로가 필수 볼륨에 마운트되어 있지 않습니다: $BACKUP_ROOT" >&2
    exit 2
  fi
fi

LOCAL_USER=$(id -un)
LOCAL_DB_URL=${NAEZIP_LOCAL_DB_URL:-"postgresql://${LOCAL_USER}@localhost:5432/naezip"}
BOT_SQLITE=${NAEZIP_BOT_SQLITE_PATH:-}
STAMP=${NAEZIP_BACKUP_STAMP:-$(date '+%Y%m%d-%H%M%S')}
case "$STAMP" in
  *[!0-9A-Za-z._-]*|'')
    echo "[naezip-backup] 잘못된 백업 식별자: $STAMP" >&2
    exit 2
    ;;
esac

PARTIAL_DIR=""
LATEST_TMP=""
FINAL_DIR="$BACKUP_ROOT/$STAMP"

cleanup_partial() {
  status=$?
  if [ "$status" -ne 0 ] && [ -n "$PARTIAL_DIR" ] && [ -d "$PARTIAL_DIR" ]; then
    rm -rf -- "$PARTIAL_DIR"
  fi
  if [ "$status" -ne 0 ] && [ -n "$LATEST_TMP" ] && [ -f "$LATEST_TMP" ]; then
    rm -f -- "$LATEST_TMP"
  fi
}
trap cleanup_partial EXIT

if [ -e "$FINAL_DIR" ]; then
  echo "[naezip-backup] 같은 시각의 백업이 이미 있습니다: $FINAL_DIR" >&2
  exit 1
fi
PARTIAL_DIR=$(mktemp -d "$BACKUP_ROOT/.partial-$STAMP-XXXXXX")

for command_name in pg_dump pg_restore shasum; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[naezip-backup] 필수 명령을 찾을 수 없습니다: $command_name" >&2
    exit 2
  fi
done

echo "[naezip-backup] PostgreSQL 원장 백업 시작"
pg_dump --format=custom --no-owner --no-acl --dbname="$LOCAL_DB_URL" \
  --file="$PARTIAL_DIR/naezip-postgres.dump"
pg_restore --list "$PARTIAL_DIR/naezip-postgres.dump" >/dev/null

if [ -n "$BOT_SQLITE" ]; then
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[naezip-backup] 필수 명령을 찾을 수 없습니다: sqlite3" >&2
    exit 2
  fi
  if [ ! -f "$BOT_SQLITE" ]; then
    echo "[naezip-backup] 봇 SQLite를 찾을 수 없습니다: $BOT_SQLITE" >&2
    exit 1
  fi
  echo "[naezip-backup] 봇 SQLite 일관 백업 시작"
  sqlite3 "$BOT_SQLITE" ".backup '$PARTIAL_DIR/realestate-alert.db'"
  SQLITE_CHECK=$(sqlite3 "$PARTIAL_DIR/realestate-alert.db" 'PRAGMA quick_check;')
  if [ "$SQLITE_CHECK" != "ok" ]; then
    echo "[naezip-backup] SQLite 무결성 검사 실패: $SQLITE_CHECK" >&2
    exit 1
  fi
fi

(
  cd "$PARTIAL_DIR"
  shasum -a 256 ./* > SHA256SUMS
)

mv "$PARTIAL_DIR" "$FINAL_DIR"
PARTIAL_DIR=""

# 마지막 검증 성공본 포인터도 같은 백업 루트 안에서 원자적으로 교체한다.
# 이후 실행이 실패하면 기존 LATEST_SUCCESS는 그대로 남는다.
LATEST_TMP="$BACKUP_ROOT/.LATEST_SUCCESS-$STAMP-$$"
printf '%s\n' "$STAMP" > "$LATEST_TMP"
mv -f "$LATEST_TMP" "$BACKUP_ROOT/LATEST_SUCCESS"
LATEST_TMP=""

echo "[naezip-backup] 완료: $FINAL_DIR"
echo "[naezip-backup] 마지막 성공본: $BACKUP_ROOT/LATEST_SUCCESS"
echo "[naezip-backup] 다음 단계: scripts/macmini-restore-check.sh로 별도 임시 DB 복원 시험을 수행하세요."
