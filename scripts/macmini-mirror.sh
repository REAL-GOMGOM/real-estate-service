#!/bin/bash
# Neon → 맥미니 로컬(naezip) 원장 증분 미러 (2026-08-02, 의존도 완화 1단계)
#
# 목적: Neon 무료 티어(512MB·5GB/월)를 "서빙 캐시"로 두고, 전체 이력은
# 맥미니 로컬 Postgres 에 무제한 보존한다. Neon 보존정책(매매 13개월·
# 전월세 7개월)이 지워도 로컬엔 남는다 — 미러는 DELETE 를 전파하지 않음.
#
# 방식: 각 테이블의 로컬 max(updated_at) - 1일(중복 안전 오버랩)을
# 하이워터마크로, Neon 에서 그 이후 갱신분만 CSV 로 끌어와 PK upsert.
# 전송량: 일 ~10-20MB 수준 (sync 크론이 갱신하는 최근 2개월 신고분만).
#
#   수동 실행:  bash scripts/macmini-mirror.sh
#   정기 실행:  launchd com.gomgom.naezip-mirror (매일 06:30)
set -euo pipefail
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

ENV_FILE=/Users/bangjoohan/real-estate-service/.env.local
LOCAL_DB=naezip
WORK_DIR=$(mktemp -d /tmp/naezip-mirror.XXXXXX)
trap 'rm -rf "$WORK_DIR"' EXIT

NEON_URL=$(grep '^DATABASE_URL_UNPOOLED=' "$ENV_FILE" | cut -d= -f2- | tr -d '"')
if [ -z "$NEON_URL" ]; then
  echo "[$(date '+%F %T')] ✗ DATABASE_URL_UNPOOLED 를 .env.local 에서 찾지 못함" >&2
  exit 1
fi

mirror_table() {
  local table=$1 pk=$2
  local hwm csv rows
  hwm=$(psql -d "$LOCAL_DB" -tA -c \
    "SELECT coalesce(to_char(max(updated_at) - interval '1 day', 'YYYY-MM-DD\"T\"HH24:MI:SSOF'), '1970-01-01T00:00:00+00') FROM $table")
  csv="$WORK_DIR/$table.csv"

  psql "$NEON_URL" -v ON_ERROR_STOP=1 -qAt -c \
    "\\copy (SELECT * FROM $table WHERE updated_at > '$hwm') TO '$csv' (FORMAT csv)"
  rows=$(wc -l < "$csv" | tr -d ' ')

  if [ "$rows" -eq 0 ]; then
    echo "[$(date '+%F %T')] $table: 신규 0건 (hwm=$hwm)"
    return
  fi

  psql -d "$LOCAL_DB" -v ON_ERROR_STOP=1 -q <<SQL
CREATE TEMP TABLE tmp_mirror (LIKE $table INCLUDING DEFAULTS);
\\copy tmp_mirror FROM '$csv' (FORMAT csv)
DELETE FROM $table t USING tmp_mirror s WHERE t.$pk = s.$pk;
INSERT INTO $table SELECT * FROM tmp_mirror;
SQL
  echo "[$(date '+%F %T')] $table: ${rows}건 미러 (hwm=$hwm)"
}

echo "[$(date '+%F %T')] ── naezip 원장 미러 시작 ──"
mirror_table transactions      dedupe_key
mirror_table rent_transactions dedupe_key
mirror_table apartments        id

psql -d "$LOCAL_DB" -tA -c \
  "SELECT '로컬 원장: 매매 ' || (SELECT count(*) FROM transactions) || ' · 전월세 ' || (SELECT count(*) FROM rent_transactions) || ' · 단지 ' || (SELECT count(*) FROM apartments)"
echo "[$(date '+%F %T')] ── 완료 ──"
