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

- `macmini-sync.ts`는 로컬 원장을 먼저 적재하고 Neon을 나중에 갱신한다.
- Neon이 전송량 한도 또는 HTTP 402를 반환하면 회로를 열고 남은 Neon 작업을 건너뛴다.
  로컬 적재는 계속되며 프로세스는 `DEGRADED`와 종료코드 `2`를 남긴다.
- `macmini-mirror.sh`는 기본 실행을 거부한다. 재해 복구가 꼭 필요한 일회성 작업에서만
  `NAEZIP_ENABLE_NEON_MIRROR=1`을 명시한다.
- Vercel Cron은 사용하지 않는다. 데이터 수집은 맥미니에서만 실행한다.

종료코드 의미:

- `0`: 로컬 원장과 Neon 발행 모두 정상
- `1`: 원천 수집 또는 로컬 원장 적재 실패
- `2`: 로컬 원장은 보존됐지만 Neon 발행이 저하됨

## 일일 확인

1. `launchctl print gui/$(id -u)/com.gomgom.naezip-sync`에서 최근 종료코드를 확인한다.
2. `~/Library/Logs/naezip-sync.log` 마지막 줄의 `status`, `circuit`, `skipped`를 확인한다.
3. 최근 성공이 36시간을 넘었거나 디스크 사용량이 85%를 넘으면 알림을 보낸다.
4. `com.gomgom.naezip-mirror`는 평상시 로드하지 않는다.

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
bash scripts/macmini-backup.sh
```

## Neon 복구 후 순서

1. Neon 대시보드에서 전송량 한도와 다음 초기화 시각을 확인한다.
2. 새 원장을 밀어 넣기 전에 기존 sync의 보존 정리가 성공하는지 확인한다.
3. 수동 sync 한 번을 실행하고 `status=HEALTHY`, 행 수, 주요 API 결과를 검증한다.
4. Preview에서 홈·지역·검색·단지 상세의 결과를 운영판과 비교한다.
5. 3~7일 안정화 전에는 기존 raw 테이블을 삭제하지 않는다.

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
