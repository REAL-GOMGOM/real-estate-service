# 맥미니 원장 · Neon 서빙 캐시 운영 가이드

## 목표 구조

```text
국토교통부 API
  → 맥미니 PostgreSQL (전체 원장·장기 보존)
  → Neon (최근 데이터·집계·블로그용 서빙 캐시)
  → Vercel/CDN (공개 사이트)
```

맥미니는 외부에 DB 포트를 열지 않는다. 공개 요청은 Neon 또는 CDN의 마지막 성공본만
읽는다. 맥미니·회선 장애 때도 사이트는 직전 성공본을 제공하고 새 데이터 갱신만 늦어져야
한다.

## 현재 안전장치

- `macmini-sync.ts`는 기본적으로 로컬 원장만 적재한다. Mac→Neon serving-cache
  write/purge/size 조회는 `NAEZIP_ENABLE_NEON_CACHE_WRITE=1`일 때만 client 생성부터 허용한다.
- Neon이 전송량 한도 또는 HTTP 402를 반환하면 회로를 열고 남은 Neon 작업을 건너뛴다.
  로컬 적재는 계속되며 프로세스는 `DEGRADED`와 종료코드 `2`를 남긴다.
- `macmini-mirror.sh`는 기본 실행을 거부한다. 재해 복구가 꼭 필요한 일회성 작업에서만
  `NAEZIP_ENABLE_NEON_MIRROR=1`을 명시한다.
- 두 opt-in은 방향과 목적이 다르며 서로 대체하지 않는다. `CACHE_WRITE`는 Mac→Neon,
  `MIRROR`는 Neon→Mac 재해복구다.
- Vercel Cron은 사용하지 않는다. 데이터 수집은 맥미니에서만 실행한다.

종료코드 의미:

- `0`: 로컬 원장 정상. cache-write가 opt-in이면 Neon도 정상
- `1`: 원천 수집 또는 로컬 원장 적재 실패
- `2`: 로컬 원장은 보존됐지만 Neon 발행이 저하됨

## 일일 확인

1. `launchctl print gui/$(id -u)/com.gomgom.naezip-sync-and-publish`에서 최근 종료코드를 확인한다.
2. `~/Library/Logs/naezip-sync.log` 마지막 줄의 `status`, `circuit`, `skipped`를 확인한다.
3. 최근 성공이 36시간을 넘었거나 디스크 사용량이 85%를 넘으면 알림을 보낸다.
4. `com.gomgom.naezip-mirror`는 평상시 로드하지 않는다.

## launchd 감사 및 백업 등록 전 점검

2026-08-11 읽기 전용 감사에서 sync·mirror·Obsidian export LaunchAgent는 확인됐지만
`com.gomgom.naezip-backup`은 등록되어 있지 않았다. 이 저장소에는 안전한 설정 예시만 두며,
자동 등록은 하지 않는다.

1. `scripts/launchd/com.gomgom.naezip-backup.plist.example`을 별도 작업 파일로 복사한다.
2. `NAEZIP_BACKUP_DIR`과 `NAEZIP_REQUIRED_VOLUME`의 `/Volumes/CHANGE_ME`를 실제
   암호화 외장 볼륨으로 모두 바꾼다.
3. `ProgramArguments`, PostgreSQL URL, SQLite 경로가 현재 설치 위치와 일치하는지 확인한다.
4. `plutil -lint`를 통과시킨 뒤에만 `~/Library/LaunchAgents`에 설치한다.
5. 설치 후 `launchctl print gui/$(id -u)/com.gomgom.naezip-backup`과 두 로그 파일을 확인한다.

백업 시각 예시는 03:30 KST다. 05:00 원장 sync 전에 전날 마지막 성공 상태를 보존하기
위한 순서이다. `NAEZIP_REQUIRED_VOLUME`은 해당 경로 자체가 독립된 마운트 지점인
경우만 통과시키므로, 외장 볼륨이 빠졌을 때 로컬 경로로 폴백하지 않는다.

## 백업 최소 기준

- PostgreSQL은 매일 custom-format `pg_dump -Fc`로 백업한다.
- 실행 중인 SQLite는 파일 복사가 아니라 SQLite backup API를 사용한다.
- 보존은 일 7개, 주 4개, 월 6개를 기본으로 한다.
- 최소 한 사본은 맥미니 밖의 암호화된 저장소에 둔다.
- 매주 빈 임시 DB에 실제 복원 시험을 하고 성공 시각을 기록한다.
- `.env.local`, 로컬 DB, 백업, 로그 권한은 소유자 전용(`chmod 600`)으로 제한한다.

`NAEZIP_BACKUP_DIR`을 외장 또는 암호화 저장소로 지정한 뒤 다음 스크립트를 실행한다.
스크립트는 PostgreSQL archive와 선택한 봇 SQLite를 검증하고 SHA-256 목록을 만든다.
자동 보존 삭제는 하지 않는다.

```bash
NAEZIP_REQUIRED_VOLUME=/Volumes/암호화볼륨 \
NAEZIP_BACKUP_DIR=/Volumes/암호화볼륨/naezip-backups \
  bash scripts/macmini-backup.sh
```

백업은 `.partial-*`에서 완성·검증된 뒤 타임스탬프 디렉터리로 이름을 바꾼다. 성공한
경우에만 `LATEST_SUCCESS` 포인터를 원자적으로 갱신한다. 다음 실행이 실패해도 기존 성공본과
포인터는 유지되며, 실패한 partial만 정리한다.

### 복원 점검

체크섬·PostgreSQL archive 목차·SQLite 무결성만 확인하려면 다음을 실행한다.

```bash
NAEZIP_BACKUP_DIR=/Volumes/암호화볼륨/naezip-backups \
  bash scripts/macmini-restore-check.sh
```

주 1회는 이름이 `naezip_restore_check_`로 시작하는 **빈 로컬 임시 DB**를 운영자가 먼저
만든 뒤 실제 복원을 수행한다. 스크립트는 운영 DB 이름을 거부하고 임시 DB를 삭제하지 않는다.

```bash
createdb naezip_restore_check_20260811
NAEZIP_BACKUP_DIR=/Volumes/암호화볼륨/naezip-backups \
NAEZIP_RESTORE_CHECK_DB_URL=postgresql:///naezip_restore_check_20260811 \
  bash scripts/macmini-restore-check.sh
```

성공 로그의 백업 식별자, 테이블 수, 시각을 운영 기록에 남긴 뒤 임시 DB를 수동 정리한다.
복원 점검 전에는 어떤 운영 DB도 drop·clean 대상으로 지정하지 않는다.

## Obsidian export 안전성

Obsidian export는 Neon과 봇 SQLite를 **모두 먼저 조회**한다. 이후 볼트와 같은
파일시스템의 숨김 stage에 칼럼·뉴스·홈 완성본을 만들고 파일 수를 검증한 뒤 관리 경로를
rename으로 교체한다. 조회·생성·교체 중 오류가 발생하면 기존 성공본을 유지하거나 즉시
롤백한다. 교체 중 SIGKILL·재부팅으로 catch가 실행되지 않아도 다음 시작이 hidden
backup manifest를 먼저 읽고 이전 성공본을 복구한 뒤 원천을 조회한다.

- 기본값은 posts 또는 news가 0건이면 교체를 거부한다.
- 정말 빈 아카이브가 의도된 경우에만 일회성으로 `OBSIDIAN_ALLOW_EMPTY_EXPORT=1`을 쓴다.
- 봇 DB 경로를 바꿀 때는 `OBSIDIAN_BOT_DB`를 설정한다.
- 환경파일은 launchd `WorkingDirectory`의 `.env.local`을 기본으로 읽는다. 다른 경로는
  `NAEZIP_ENV_FILE`에 절대 경로로 명시한다.
- 실패 로그가 난 뒤 기존 `내집 칼럼`, `뉴스 아카이브`, `홈.md`가 남아 있는지 확인한다.

## Neon 복구 후 순서

1. 외부 백업 최신본과 임시 DB restore check를 먼저 확인한다.
2. Neon 대시보드에서 전송량 한도와 다음 초기화 시각을 확인한다.
3. 기본 wrapper `--dry-run`을 실행한다. 이 플래그는 객체 저장소 발행만 local sink로 바꾸며 MOLIT
   수집과 로컬 PostgreSQL write는 실제 수행되므로 전체 모의 실행으로 간주하지 않는다.
4. 전송량 예산을 확인한 뒤에만 일회성 환경에서 `NAEZIP_ENABLE_NEON_CACHE_WRITE=1`을 켜고
   수동 sync 한 번을 실행해 `status=HEALTHY`, 행 수, 주요 API 결과를 검증한다.
5. Preview에서 홈·지역·검색·단지 상세의 결과를 운영판과 비교한다.
6. 3~7일 안정화 전에는 기존 raw 테이블을 삭제하지 않는다.

## 다음 단계: 얇은 serving schema

Neon에는 전체 원장 대신 다음 최소 데이터를 발행한다.

- 최근 12개월 매매와 최근 6개월 전월세의 공개 필드
- `master_id` 기준 단지 조회 인덱스
- 홈 요약, highlights, ranking, market-live의 준비된 결과
- 마지막 성공 시각, 원본 기준시각, 행 수, 체크섬

맥미니에서 `content_hash`가 달라진 지역·단지만 stage 테이블에 올리고, 검증 후 한
트랜잭션으로 현재본을 교체한다. 발행 실패 때는 빈 배열로 덮지 않고 직전 성공본을 남긴다.

## 배포·AdSense 게이트

- DB 장애 또는 샘플/placeholder가 공개 도메인에 남아 있을 때 운영 배포·AdSense 재심사를
  요청하지 않는다.
- Preview 빌드, 전체 테스트, 주요 공개 URL 점검, Neon 정상 상태를 모두 통과한 뒤 운영에
  승격한다.
- AdSense 승인 전에는 슬롯 ID를 만들거나 임의값을 넣지 않는다.
