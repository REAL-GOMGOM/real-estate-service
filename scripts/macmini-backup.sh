#!/bin/bash
# 맥미니 원장 일관 백업. 기존 백업은 삭제하지 않으며, 새 백업 검증이 끝난 뒤에만
# .partial 디렉터리를 최종 디렉터리로 원자적으로 이름 변경한다.
set -euo pipefail
umask 077

export PATH="/opt/homebrew/opt/postgresql@17/bin:/opt/homebrew/bin:$PATH"

BACKUP_ROOT=${NAEZIP_BACKUP_DIR:-}
if [ -z "$BACKUP_ROOT" ]; then
  echo "[naezip-backup] NAEZIP_BACKUP_DIR을 외장 또는 암호화 백업 경로로 설정하세요." >&2
  exit 2
fi

LOCAL_USER=$(id -un)
LOCAL_DB_URL=${NAEZIP_LOCAL_DB_URL:-"postgresql://${LOCAL_USER}@localhost:5432/naezip"}
BOT_SQLITE=${NAEZIP_BOT_SQLITE_PATH:-}
STAMP=$(date '+%Y%m%d-%H%M%S')
PARTIAL_DIR="$BACKUP_ROOT/.partial-$STAMP-$$"
FINAL_DIR="$BACKUP_ROOT/$STAMP"

mkdir -p "$BACKUP_ROOT"
if [ -e "$FINAL_DIR" ]; then
  echo "[naezip-backup] 같은 시각의 백업이 이미 있습니다: $FINAL_DIR" >&2
  exit 1
fi
mkdir "$PARTIAL_DIR"

echo "[naezip-backup] PostgreSQL 원장 백업 시작"
pg_dump --format=custom --no-owner --no-acl --dbname="$LOCAL_DB_URL" \
  --file="$PARTIAL_DIR/naezip-postgres.dump"
pg_restore --list "$PARTIAL_DIR/naezip-postgres.dump" >/dev/null

if [ -n "$BOT_SQLITE" ]; then
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
echo "[naezip-backup] 완료: $FINAL_DIR"
echo "[naezip-backup] 다음 단계: 별도 임시 DB에 pg_restore 복원 시험을 수행하세요."
