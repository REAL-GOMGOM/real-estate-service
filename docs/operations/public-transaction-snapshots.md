# 공개 실거래 serving snapshot 운영 계약

이 모듈은 Mac mini의 로컬 원장을 공개 조회용 district snapshot으로 변환하고 24개 shard에 담은 뒤,
검증된 JSON 산출물만 객체 저장소에 발행하기 위한 코어다. DB 조회/export 자체와 기존 API
route 전환은 별도 단계다.

## 공개 범위

- 거래 유형: 매매(`sale`), 전월세(`rent`), 분양권(`presale`)
- 논리 파티션: `lawdCd` 5자리 기준 district별 compact raw snapshot 248개
- 물리 객체: payload byte size를 기준으로 안정적으로 균형 배치한 gzip shard 24개
- 검증된 기간: Mac sync marker가 실제 갱신을 증명하는 이번 달+직전 달, 총 2개 calendar month
- 허용 필드: 단지명·동·면적·층·가격·계약일·건축년도와 비개인 식별자만
- 취소 거래는 발행을 거부한다. 국토부 원문에서 계약일이 `00`인 행은 날짜를 만들지 않고
  `YYYY-MM`으로 정규화해 "일자 미상"이라는 사실을 보존한다.
- 매수인·매도인·사용자·이메일·전화·IP·세션·토큰·지번·요청 로그는 공개 대상이 아니다.
- `pg_dump`, SQL, SQLite/DB 파일, 백업 디렉터리, 원장 전체 파일을 publisher에 넘기지 않는다.
  객체 저장 어댑터도 `.dump`, `.sql`, `.sqlite`, `.db` 키를 거부한다.

원장 export는 `SELECT *` 대신 `source-mappers.ts`의 입력 타입에 맞춰 컬럼을 명시적으로
선택해야 한다. `is_canceled = false` 조건은 DB 쿼리에서도 먼저 적용하고, `YYYY-MM-00`은
mapper가 `YYYY-MM`으로 바꾸며 contract validator를 두 번째 방어선으로 유지한다.

## 객체와 publication boundary

고정 discovery manifest:

```text
public-transactions/v2/manifest.json
```

변경 불가능한 release 객체:

```text
public-transactions/v2/releases/{YYYYMMDDTHHMMSSZ-hash12}/shards/{00..23}.json.gz
public-transactions/v2/releases/{YYYYMMDDTHHMMSSZ-hash12}/artifacts/{name}.json.gz
public-transactions/v2/releases/{YYYYMMDDTHHMMSSZ-hash12}/manifest.json
```

publisher는 248개 snapshot, 24개 shard body, descriptor, manifest의 one-to-one mapping을 첫
PUT 전에 모두 검증한다. 실제 PUT 순서는 shard 24개 → named artifact 5개 → immutable release
manifest → 고정 discovery manifest다. 앞 단계 하나라도 실패하면 discovery manifest를 쓰지 않으므로 독자는
완성되지 않은 release를 발견하지 않는다. 버전 객체는 `max-age=31536000, immutable`, 고정
manifest는 짧은 재검증 캐시를 사용한다. Vercel Blob adapter는 모든 pathname에
`addRandomSuffix: false`를 명시한다. release 객체는 `allowOverwrite: false`이며 충돌 시 저장된
bytes의 SHA-256이 정확히 같을 때만 idempotent 재시도로 인정한다. discovery manifest는 최초
발행이면 first-writer-wins(`allowOverwrite: false`), 기존본이 있으면 origin read의 ETag와
`publishedAt`을 검증한 뒤에만 `allowOverwrite: true + ifMatch`로 교체한다.

manifest의 `shards`는 정확히 24개 descriptor와 각 shard의 district/record count를 담고,
`districts`는 정확히 248개 district의 shard ID·기간·유형별 건수·최신 계약일을 담는다.
현재 publisher는 `summary/rolling30/buy`, `summary/rolling30/jeonse`,
`summary/rolling30/monthly`, `summary/rolling30/bunyang`, `apartment-index` 다섯 named
artifact를 함께 발행한다. 모든 named artifact는 아래 envelope로 감싸며 스키마와 건수를
descriptor와 대조한다.

```ts
type PublicNamedArtifactEnvelope<T> = {
  schema: string;
  generatedAt: string;
  itemCount: number;
  data: T;
}
```

## 체크섬과 reader

각 descriptor는 압축 바이트 SHA-256과 압축 해제 payload SHA-256, 양쪽 byte length를 모두
가진다. `fetch()`가 `Content-Encoding: gzip`을 자동 해제한 경우에도 payload 체크섬을
검증한다. reader는 요청 district가 가리키는 shard 하나를 받아 전체 shard의 checksum/schema,
snapshot count/record count, 248-entry manifest mapping을 검증한다. 요청 `lawdCd`가 body 안에
정확히 한 번 존재하고 district/기간/유형별 건수·최신일이 일치할 때만 그 snapshot을 반환한다.

```ts
import { PublicSnapshotReader } from '@/lib/public-snapshots';

const reader = new PublicSnapshotReader({
  baseUrl: process.env.NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL!,
});

const manifest = await reader.getManifest();
const gangnam = await reader.getDistrictSnapshot('11680', manifest);
const summary = await reader.getNamedArtifact('summary/rolling30/buy', manifest);
```

공개 함수와 반환 타입:

- `getManifest(): Promise<PublicTransactionManifest>`
- `getDistrictSnapshot(lawdCd, manifest?): Promise<PublicTransactionSnapshot>`
- `getNamedArtifact<T>(name, manifest?): Promise<PublicNamedArtifactEnvelope<T>>`

### v1 → v2 무중단 전환

v2는 v1 객체를 덮어쓰지 않고 별도 `public-transactions/v2/` prefix만 사용하므로 dual-read를
넣지 않는다. 현재 Production의 이전 빌드는 계속 `v1/manifest.json`을 읽고, retention 정리 도구와
별도 운영 승인을 준비한 뒤 새 RC publisher로 v2 객체를 수동 seed한다. 그 다음 새 reader 빌드를 Preview에 배포해 v2 district·named
artifact·route를 검증하고, 통과한 동일 빌드만 Production으로 승격한다. 코드 rollback 시 이전
빌드는 보존된 v1 manifest를 다시 읽을 수 있다. v2 Production 안정화와 rollback 기간이 끝나기
전에는 v1 discovery/release 객체를 삭제하지 않는다. base URL 환경변수는 Blob store의 origin만
담으므로 v1/v2 선택은 배포된 reader의 versioned prefix가 결정한다.

## Vercel Blob public store와 안전한 dry-run

운영 기본 저장소는 Vercel Blob public store다. 기존 블로그 이미지 업로드가 사용하는
`BLOB_READ_WRITE_TOKEN`은 스냅샷 publisher가 절대 읽거나 변경하지 않는다. Mac mini 전용
`NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN`과 `NAEZIP_SNAPSHOT_STORE=blob`을 함께 지정해야 하며,
전용 토큰 또는 아래 public origin이 없으면 첫 PUT 전에 fail-closed한다.

```text
NAEZIP_SNAPSHOT_STORE=blob
NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL=https://{store-id}.public.blob.vercel-storage.com/
```

base URL은 public Blob store의 정확한 HTTPS origin이어야 하고 경로·query·fragment를 허용하지
않는다. token에 인코딩된 store ID와 이 origin을 첫 네트워크 요청 전에 대조하고, 모든 SDK 반환
URL의 origin과 pathname도 검증한다. CLI 성공 로그에는 최종 manifest URL과 reader에 넣을 base
origin을 출력한다. read-write token은 Mac mini의 `0600` secure env에만 두고
Preview/Production Vercel env나 `NEXT_PUBLIC_` 변수에 복사하지 않는다. SDK 오류 message/body는
token-derived 식별자나 URL을 포함할 수 있으므로 adapter가 고정 오류문으로 치환한다.

generic factory는 명시한 저장소가 없으면 local dry-run store를 선택하지만, 운영 CLI는 자격정보
유실을 정상 완료로 오인하지 않도록 더 엄격하다. CLI에서는 `--dry-run`을 명시한 경우에만 Blob과
R2 자격정보/모드 선택을 제거하고 `NAEZIP_SNAPSHOT_DRY_RUN_DIR`에 기록한다. 이 플래그 없는 기본
production은 `NAEZIP_SNAPSHOT_STORE=blob`과 전용 snapshot Blob token을 요구한다.

```ts
import {
  createPublicSnapshotStoreFromEnv,
  publishPublicSnapshotRelease,
} from '@/lib/public-snapshots';

const selection = createPublicSnapshotStoreFromEnv();
const result = await publishPublicSnapshotRelease({
  store: selection.store,
  snapshots,
  namedArtifacts,
});
console.log(selection.mode, result.releaseId);
```

R2/S3는 legacy fallback으로만 유지한다. 아래처럼 명시적으로 선택할 때 네 값이 모두 필요하다.

```text
NAEZIP_SNAPSHOT_STORE=r2
NAEZIP_SNAPSHOT_R2_ACCOUNT_ID
NAEZIP_SNAPSHOT_R2_ACCESS_KEY_ID
NAEZIP_SNAPSHOT_R2_SECRET_ACCESS_KEY
NAEZIP_SNAPSHOT_R2_BUCKET
```

기본 endpoint는 `https://{accountId}.r2.cloudflarestorage.com`이다. 다른 S3-compatible
테스트 저장소에서만 `NAEZIP_SNAPSHOT_R2_ENDPOINT`를 명시한다. 쓰기 자격정보은 Mac mini
publisher에만 두고 `NEXT_PUBLIC_` 변수나 Vercel 브라우저 번들에 넣지 않는다.

## Mac mini sync health gate와 실행 순서

운영 발행은 publisher를 단독 실행하지 않고 아래 wrapper를 사용한다. wrapper는 프로젝트
`.env.local` 또는 실행 전에 지정한 `NAEZIP_ENV_FILE`을 한 번만 읽고, 이미 shell/launchd에
설정된 값은 덮어쓰지 않는다. 이렇게 만든 동일한 child environment를 sync와 publisher에
모두 전달하며 비밀 값 자체는 로그로 출력하지 않는다. `macmini-sync.ts`의 standalone dotenv도
같은 `NAEZIP_ENV_FILE`/프로젝트 `.env.local` 규칙과 `override=false`를 사용하므로 wrapper가
전달한 값이 우선한다.

```bash
# 기본: 프로젝트 .env.local
node --import tsx scripts/run-local-sync-and-publish.ts

# 별도 보안 경로를 사용할 때(파일 안이 아니라 wrapper 실행 전에 지정)
export NAEZIP_ENV_FILE=/secure/path/naezip-production.env
node --import tsx scripts/run-local-sync-and-publish.ts
```

환경파일에 자격정보를 넣기 전에 권한을 반드시 확인한다. canonical `.env.local`이 `0644`이면
다른 로컬 사용자가 읽을 수 있으므로 실제 비밀을 추가하기 전에 `0600`으로 바꾼다. 이
저장소 작업은 외부 파일 권한을 자동 변경하지 않는다. wrapper는 비밀을 읽기 전에 symbolic
link의 실제 target을 `stat`하고, regular file이 아니거나 group/other 권한 비트가 하나라도
있으면 fail-closed로 중단한다.

```bash
stat -f '%Lp %N' .env.local
chmod 600 .env.local
stat -f '%Lp %N' .env.local   # 600 확인
```

wrapper는 sync child를 시작하기 **전에** 기존 healthy marker를 exit 1 marker로 원자 교체한다.
따라서 sync 중 SIGKILL·재부팅이 발생해 로컬 원장이 부분 갱신되어도 이전 exit 0/2 marker가
남지 않는다. sync가 끝나면 최종 종료코드를 다시 원자 기록하고, 0 또는 2일 때만 publisher를
실행한다. sync 시작과 완료의 KST calendar date가 다르면 exit 1로 강등해 발행을 차단한다.
따라서 월말 자정을 넘긴 작업이 서로 다른 월 coverage를 하나의 완료 작업처럼 주장하지 않는다.
launchd 등록은 별도 운영 승인 사항이며 이 저장소 작업만으로 자동 등록하지 않는다.

종료코드 계약:

- `0`: 공공 소스 수집·로컬 PostgreSQL이 정상이며, opt-in된 경우 Neon cache write도 정상이다. 발행 허용.
- `1`: sync 진행 중 fail-closed 상태이거나 공공 소스 수집/로컬 적재 실패다. 발행 차단.
- `2`: 로컬 원장은 정상이지만 Neon만 quota/쓰기 장애로 degraded다. 로컬 snapshot 발행 허용.

marker 설정:

```text
NAEZIP_SYNC_HEALTH_MARKER=.local/macmini-sync-health.json
NAEZIP_SYNC_HEALTH_MAX_AGE_HOURS=36
```

production Blob/R2 모드의 단독 publisher는 marker가 없거나, 기본 36시간보다 오래됐거나, 최신
종료코드가 1이면 객체 업로드 전에 실패한다. `--allow-stale-local`은 장애 조사 중 운영자가
로컬 원장의 완전성을 별도로 확인한 경우에만 쓰는 **수동 비상 우회**다. launchd나 정기
자동화에는 절대 넣지 않는다. 발행 시각이 다음 날이나 다음 달로 넘어가도 snapshot의
`generatedAt`과 조회 월 범위는 wall clock이 아니라 검증된 marker `completedAt`을 기준으로
계산한다. wrapper가 publisher child에 넘기는 `NAEZIP_SNAPSHOT_SOURCE_AT`은 이 값을 대조하기
위한 내부 capability이며 `.env.local`에 운영자가 직접 설정하지 않는다.

```bash
# 정기 실행 금지: 수동 비상 복구에서만 사용. SOURCE_AT은 운영자가 검증한
# 로컬 원장의 실제 완료 시각(UTC ISO)이며 생략하면 production 발행이 거부된다.
NAEZIP_SNAPSHOT_SOURCE_AT=2026-08-11T05:00:00.000Z \
  node --import tsx scripts/publish-public-transactions.ts --allow-stale-local
```

자격정보 없이 로컬 산출물만 검증할 때도 sync 선행 계약을 확인하려면 wrapper에 dry-run을
준다. 이 모드는 **객체 저장소 발행만** local sink로 바꾼다. 선행 `macmini-sync`의 MOLIT 요청과 로컬
PostgreSQL upsert/retention은 실제 수행되므로 전체 작업의 모의 실행이 아니다. 검증된 외부
백업과 restore check를 먼저 완료한 뒤 actual sync + local publication dry-run으로 실행한다.

```bash
node --import tsx scripts/run-local-sync-and-publish.ts --dry-run
```

## 단일 producer lock

wrapper는 sync를 시작하기 전에 저장소 root 기준
`.local/public-snapshot-publication.lock` 디렉터리를 원자 생성해 exclusive lock을 잡고,
publisher가 manifest 교체를 끝낼 때까지 유지한다. publisher child에는 임시 owner token만
상속해 lock을 중첩 획득하지 않게 한다. standalone publisher도 같은 lock을 직접 획득하므로,
느린 이전 프로세스가 나중에 discovery manifest를 덮어 release를 역행시키는 것을 차단한다.
경로를 바꿔야 하면 wrapper 환경파일에서 아래 한 변수만 지정하며, 상대경로는 shell cwd가
아니라 저장소 root 기준이다.

```text
NAEZIP_SNAPSHOT_LOCK_PATH=.local/public-snapshot-publication.lock
```

lock에는 PID와 시작시각이 기록된다. 정상·예외 종료에서는 `finally`로 해제하지만 SIGKILL이나
재부팅 뒤 orphan lock은 **자동 회수하지 않는다**. active/unknown PID와 오래된 dead PID 모두
fail-closed다. 운영자가 `ps -p <PID>`와 실행 중인 sync/publisher가 없음을 확인한 뒤 lock
디렉터리를 삭제하지 말고 별도 복구 이름으로 이동해 증거를 보존한 다음 재실행한다. 내부
owner token은 로그나 환경파일에 복사하지 않는다.

## Blob retention 수동 runbook

`scripts/retain-public-transactions.ts`는 publisher와 같은 exclusive lock 안에서만 동작한다.
현재는 wrapper·LaunchAgent에 연결하지 않은 **수동 도구**이며, 아래 구현만으로 최초 seed나
Production 정기 발행이 승인된 것은 아니다. 독립 코드 검토와 격리된 저장소 검증이 끝날 때까지
설치된 plist의 `--dry-run`을 유지한다.

기본 실행은 원격 Blob을 list/HEAD/GET해 새 계획을 만드는 read-only plan이다. 삭제 API는 호출하지
않지만 Blob Advanced Operations는 소비한다. snapshot 전용 token과 정확한 public origin을 가진
`NAEZIP_SNAPSHOT_STORE=blob`만 허용하며 local dry-run과 legacy R2는 계획·삭제 모두 거부한다.
출력은 release ID와 객체/릴리스 개수만 포함하고 token, origin, management ETag는 기록하지 않는다.
명령은 sync/publish wrapper와 같은 방식으로 `.env.local`(또는 셸에서 지정한 `NAEZIP_ENV_FILE`)을
읽고 실제 대상 파일이 regular file·최대 1MiB·권한 `0600`인지 먼저 검증한다. 이미 export한 환경값이
파일보다 우선한다. `--help`와 잘못된 옵션은 환경파일, lock, Blob에 접근하지 않는다.

```bash
npm run snapshot:retention
```

계획은 현재 discovery release, 최신 complete rollback release, 최신 complete 30개, 최근 30일
complete release를 합집합으로 보호한다. 삭제 후보는 strict manifest와 정확한 24 shards + 5
serving artifacts가 검증되고 `publishedAt`과 모든 객체 `uploadedAt`이 보존 경계보다 오래된 complete
release뿐이다. root manifest가 없는 알려진 payload는 72시간 grace 뒤에만 orphan 후보가 된다.
알 수 없는 pathname, 비정상 manifest, 중복/역순 pagination, inventory 상한 초과는 전체 계획을
0 delete로 중단한다.

실제 삭제는 plan 출력을 별도 검토한 뒤에만 실행한다. plan에 출력된 **현재 release ID 문자열을
셸 변수로 치환하지 말고** 아래 두 위치에 동일한 literal로 직접 복사한다. `--apply` 하나만으로는
실행되지 않으며, 두 확인값 중 하나라도 새 계획의 현재 release와 다르면 0 delete로 실패한다.

```bash
# 예시 ID를 사용하지 말고 직전 plan의 currentRelease를 두 위치에 그대로 직접 입력한다.
NAEZIP_SNAPSHOT_RETENTION_APPROVAL=20260813T010203Z-aaaaaaaaaaaa \
  npm run snapshot:retention -- \
  --apply --confirm-release=20260813T010203Z-aaaaaaaaaaaa
```

apply도 저장된 계획을 재사용하지 않고 잠금 안에서 inventory와 discovery를 다시 읽는다. executor는
각 release 삭제 직전에 discovery HEAD가 계획의 상태와 같은지 다시 검사한다. complete release는
immutable root manifest를 조건부 tombstone한 뒤 payload를 최대 10개씩, batch 사이 최소 1초 간격으로
삭제한다. 부분 실패 시 다음 release로 진행하지 않으며 완료된 release ID/객체 개수만 보고한다.

### 최초 seed 사전 점검

아직 객체가 하나도 없는 전용 store에서는 기본 plan이 `seedEligible=true` 한 줄만 출력해야 한다.
discovery 없이 release inventory가 하나라도 있으면 seed 가능으로 보지 않고 실패한다. 빈 store에서
`--apply`는 삭제할 현재 release가 없으므로 항상 거부된다.

1. 최신 Mac mini 외부 백업과 restore check, local publication dry-run 결과를 다시 확인한다.
2. old sync/mirror agent가 disabled이고 publisher/retention 프로세스가 없음을 확인한다.
3. 전용 Blob token과 public origin을 대조한 뒤 기본 plan을 실행한다.
4. `seedEligible=true`만 확인하고 멈춘다. retention apply는 seed 명령이 아니다.
5. 독립 코드 검토와 격리 store 검증 승인을 받은 뒤에만 별도 publisher 수동 최초 seed 절차로 간다.
6. seed 뒤 district shard와 5개 named artifact를 다시 다운로드·검증하기 전에는 Preview/Production
   route나 LaunchAgent의 `--dry-run`을 변경하지 않는다.

## LaunchAgent 교체 runbook

현재 로드된 과거 `com.gomgom.naezip-sync`는 `macmini-sync.ts`를 직접 실행해 marker·lock·publisher
계약을 우회하므로 그대로 두면 안 된다. 새 예시는
`scripts/launchd/com.gomgom.naezip-sync-and-publish.plist.example`이다. 이 저장소 작업은 실제
LaunchAgent를 수정하거나 등록하지 않는다.

1. 검증된 RC commit을 날짜가 붙은 Codex worktree가 아닌 장기 경로(예:
   `/Users/bangjoohan/Services/naezip-real-estate-service`)의 clone으로 승격한다.
2. plist 예시를 별도 staging 파일로 복사하고 다섯 placeholder를 실제 **절대경로**로 치환한다.
   Node도 `command -v node` 결과를 사용하며 `/bin/zsh -lc`나 PATH 탐색을 사용하지 않는다.
3. secure env는 `0600`, state/log 디렉터리는 해당 사용자만 쓸 수 있는지 확인한다.
4. 최신 외부 백업과 restore check를 먼저 완료한다. 예시의 `--dry-run`은 객체 저장소만 local sink로
   바꾸며 MOLIT/local PG sync는 실제로 실행된다는 점을 승인자에게 명시한다.
5. 예시의 `--dry-run`을 유지한 채 `plutil -lint` 후 old agent를 bootout하고 새 agent를 bootstrap한다.
6. actual sync + local publication kickstart의 exit/log/marker를 확인하되, 이 단계에서는 plist의
   `--dry-run`을 제거하지 않는다.

```bash
launchctl print gui/$(id -u)/com.gomgom.naezip-sync
launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/com.gomgom.naezip-sync.plist"
launchctl disable gui/$(id -u)/com.gomgom.naezip-sync
launchctl print gui/$(id -u)/com.gomgom.naezip-mirror
launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/com.gomgom.naezip-mirror.plist"
launchctl disable gui/$(id -u)/com.gomgom.naezip-mirror

# YYYYMMDD를 실제 작업일로 바꿔 보관한다. old plist를 LaunchAgents에 남겨두지 않는다.
mkdir -m 700 -p "$HOME/Library/LaunchAgents.disabled"
mv "$HOME/Library/LaunchAgents/com.gomgom.naezip-sync.plist" \
  "$HOME/Library/LaunchAgents.disabled/com.gomgom.naezip-sync.plist.disabled-YYYYMMDD"
mv "$HOME/Library/LaunchAgents/com.gomgom.naezip-mirror.plist" \
  "$HOME/Library/LaunchAgents.disabled/com.gomgom.naezip-mirror.plist.disabled-YYYYMMDD"
launchctl print-disabled gui/$(id -u)

cp scripts/launchd/com.gomgom.naezip-sync-and-publish.plist.example /private/tmp/com.gomgom.naezip-sync-and-publish.plist
# /private/tmp 사본의 __...__ placeholder를 모두 절대경로로 치환
plutil -lint /private/tmp/com.gomgom.naezip-sync-and-publish.plist
install -m 600 /private/tmp/com.gomgom.naezip-sync-and-publish.plist "$HOME/Library/LaunchAgents/com.gomgom.naezip-sync-and-publish.plist"
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/com.gomgom.naezip-sync-and-publish.plist"
launchctl kickstart -k gui/$(id -u)/com.gomgom.naezip-sync-and-publish
launchctl print gui/$(id -u)/com.gomgom.naezip-sync-and-publish
```

실제 Blob 최초 seed와 Preview 검증은 retention 도구의 독립 검토·격리 검증과 별도 운영 승인을 받은 뒤
수동 1회 명령으로만 수행한다. 현재 runbook은 production 정기 발행을 허가하지 않으며 설치된
plist의 `--dry-run`을 제거하지 않는다. 추후 정기 발행 승인을 받을 때도 설치된 plist를 즉석
수정하지 않고 staging 사본에서 변경·`plutil -lint`·재검증해야 한다. `print-disabled`에서 old
sync/mirror 두 label이 disabled이고 기존 plist가 보관 경로로 이동된 것을 확인하며, old label과
new label을 동시에 bootstrap하지 않는다.

publisher는 모든 allowlist `SELECT`를 하나의 read-only repeatable-read transaction에서
완료한 뒤에만 generic publication core를 호출한다. district 하나, summary 하나,
apartment index 하나라도 조회나 검증에 실패하면 discovery manifest를 교체하지 않는다.
운영 release는 추가로 `DISTRICT_CODE` 전체 248개 파티션이 정확히 존재하는지 검사한다.
대폭 감소 사고를 막는 production absolute floor는 검증된 2개 calendar month 전국 합계 10,000건,
데이터가 있는 지역 100개, 매매 1,000건, 전월세 1,000건, 분양권 10건,
`apartment-index` 25,000건이다(현재 Mac 원장 약 29,334건 기준의 보수 floor). 개별 0건
지역은 정상이지만 전국 all-zero, 빈/급감 단지
인덱스, 누락·오표기 파티션, 유형별 급감은 발행을 차단한다. 이 floor는 환경변수로 낮출 수
없다. 이전 manifest 대비 감소율 비교 gate는 아직 구현하지 않았다. 축소/빈 release와 작은
threshold 허용 옵션은 단위 테스트 fixture 전용이며 CLI에서
노출하지 않는다.

네 rolling summary와 `apartment-index`는 정확히 다섯 개여야 하며 각각 strict schema와
`itemCount`를 다시 검증한다. summary UI의 등록 범위는 전체 248개 중 `DISTRICT_GROUPS`에
등록된 164개 시군구다. 따라서 각 artifact의 `[from,to)`·정확 계약일·거래유형 조건으로 같은
164개 raw record를 다시 세어 `estimatedCount` 합계와 정확히 일치해야 한다. 네 유형 중 하나가
0이거나 parity가 어긋나면 발행하지 않는다. 전국 raw 원장의 최신 **정확 계약일**도 매매·전월세
각 14일, 분양권 30일 이내여야 한다. `YYYY-MM` 일자 미상 행은 보존하지만 freshness 근거로는
인정하지 않는다.

Mac sync는 각 구·월 XML의 첫 `totalCount`와 전체 페이지 parser item 수가 정확히 같은지
upsert 전에 확인한다. 알려진 결측 행 일부는 로그 후 제외하되, 한 응답에서 최소 10건이면서
20%를 초과해 거부되면 schema drift로 간주해 sync exit 1과 marker 차단으로 이어진다. 로컬
PostgreSQL URL은 sync와 publisher가 같은 validator를 사용하며 authority는
`localhost`/`127.0.0.1`/`::1`만 허용한다. query의 `host`, `hostaddr`, `service` routing
override도 대소문자와 관계없이 거부한다.

Mac→Neon serving-cache write/purge/size 조회는 `NAEZIP_ENABLE_NEON_CACHE_WRITE=1`일 때만
활성화한다. 기본/unset/`0`에서는 Neon client 자체를 만들지 않고 로컬 sync만 수행하며, 로컬
성공은 exit 0이다. 이 변수는 Neon quota 복구와 예상 전송량을 운영자가 확인한 뒤에만 켠다.
반대 방향인 Neon→Mac 재해복구 `NAEZIP_ENABLE_NEON_MIRROR=1`과 절대 재사용하지 않는다.
과거 `com.gomgom.naezip-mirror` LaunchAgent가 로드돼 있다면 먼저 `launchctl print`로 확인하고,
평시에는 별도로 bootout한다. 새 sync-and-publish plist 예시는 cache write를 `0`으로 고정한다.

`PUBLIC_TRANSACTION_SNAPSHOT_MONTHS=2` 정책 상수는 Mac sync와 publisher가 함께 사용한다.
로컬 DB에 더 오래된 원장이 남아 있어도 marker가 그 구간의 재수집/완주를 증명하지 않으므로
snapshot은 2개월만 조회·선언한다. 3개월·6개월 요청은 authoritative hit로 가장하지 않고
`period-not-covered` miss가 되어 기존 제한적 DB/live fallback으로 넘어간다. durable coverage
ledger 또는 검증된 backfill 절차가 생기기 전에는 이 상수를 늘리지 않는다.

## 로컬 schema prerequisite

로컬 PostgreSQL에는 `transactions`, `rent_transactions`, `silv_transactions`, `apartments`,
`apt_scores` 테이블이 모두 있어야 한다. 특히 `apt_scores` 테이블 자체가 없으면 score를
조용히 전부 null로 간주하지 않고 apartment-index 쿼리 실패로 전체 발행을 차단한다. 반면
테이블은 존재하지만 특정 단지에 매칭되는 `master_id` 행이 없는 것은 정상이며 그 단지의
`score`만 `null`로 발행한다.

실행 전 최소 사전 점검:

```bash
psql "$NAEZIP_LOCAL_DB_URL" -v ON_ERROR_STOP=1 -Atqc \
  "SELECT to_regclass('public.transactions'),
          to_regclass('public.rent_transactions'),
          to_regclass('public.silv_transactions'),
          to_regclass('public.apartments'),
          to_regclass('public.apt_scores')"
```

다섯 값 중 하나라도 비어 있으면 migration/seed 상태를 복구한 뒤 다시 실행한다. `apt_scores`
행 수가 0이거나 일부 단지만 점수가 있어도 발행 자체는 가능하다.

로컬 원장에 `apt_scores`만 빠진 경우 전체 Drizzle migration이나
`scripts/import-apt-scores.ts --execute`를 실행하지 않는다. 두 경로는 `.env.local`의 Neon URL을
사용할 수 있다. 아래 로컬 전용 bootstrap은 localhost URL만 허용하며, `--execute`를 명시했을
때에만 `public.apt_scores` 테이블과 인덱스를 트랜잭션으로 생성한다. 기존 행과 다른 테이블은
수정하지 않는다.

```bash
NAEZIP_LOCAL_DB_URL='postgresql://bangjoohan@localhost:5432/naezip' \
node --import tsx scripts/bootstrap-local-apt-scores.ts --execute
```

새 wrapper는 MOLIT 동기화를 시작하기 전에 같은 스크립트의 읽기 전용 `--check`를 실행한다.
스키마가 없거나 호환되지 않으면 health marker를 실패로 유지하고 동기화·발행을 모두 차단한다.

## 운영 전 점검

1. 로컬 원장 export가 district별이며 취소 거래를 제외하고 일자 미상은 `YYYY-MM`으로
   보존하는지 확인한다.
2. `.env.local` 또는 `NAEZIP_ENV_FILE` 권한이 `0600`인지 확인한다.
3. `apt_scores`를 포함한 로컬 schema prerequisite를 확인한다.
4. 외부 백업 최신본과 임시 DB restore check를 먼저 확인한다.
5. 자격정보 없이 wrapper `--dry-run`을 수행한다. 이 단계는 actual MOLIT/local PG sync + local
   publication이며, 248개 파티션·totals·index 건수를 확인한다.
6. 단위 테스트와 TypeScript/ESLint를 통과시킨다.
7. 별도 public Blob store와 정확한 origin을 준비하고 Vercel Usage에서 plan/Advanced Operations
   예산을 확인한다. 현재 release는 24 shards + 5 artifacts + 2 manifests = **31 PUT**이다.
   향후 하루 1회 발행 기준 30일에 약 930 Advanced Operations로 Hobby 포함 2,000 안에 머문다.
   수동 재발행·dashboard 탐색·블로그 업로드도 같은 quota를 쓰므로 여유를 모니터링한다.
8. snapshot 전용 Blob read-write token을 Mac mini에만 설정한다.
9. retention 도구의 독립 검토·격리 저장소 검증과 별도 승인을 마친 뒤 수동 최초 seed를 실행하고, reader로 district와
   named artifact를 다시 다운로드해 검증한다. launchd production 발행은 아직 켜지 않는다.
10. Preview route를 snapshot 우선, 기존 DB를 제한적 fallback으로 전환한 뒤 운영 반영한다.

### Blob 비용·보존·지연 계약

정기 발행이 별도로 승인된 뒤에는 48시간 freshness를 지키기 위해 하루 1회만 수행한다. 실패한
작업을 무한 재시도하지 않고 다음 healthy sync 또는 운영자 확인 뒤 재실행한다. 실제 로컬 백업 표본에서 2개월 거래
shard 총량은 약 4.0MB(24개 평균 약 167KB)였고, apartment index를 포함한 release는 약 4.5MB다.
요청 district는 shard 하나만 내려받으므로 district 단독 객체보다 transfer가 늘지만, 이 크기는
4초 reader timeout과 Blob CDN 캐시 범위 안이다. Preview에서 가장 큰 shard의 fetch/decode 지연과
route 총 지연을 측정한 후 Production으로 올린다.

immutable release를 영구 보존하면 하루 약 4.5MB 기준 약 7개월 후 1GB에 접근한다. retention은
위 수동 plan/apply 도구로만 구현되어 있고 정기 자동화·운영 apply는 아직 승인되지 않았다. 따라서
Vercel Usage를 계속 모니터링하고 독립 검증 전에는 수동 삭제도 실행하지 않는다. 현재 discovery와
직전 rollback, 최신 30개와 최근 30일 release 보호 계약을 유지하며, Mac mini 원장/백업이 source of
truth라는 원칙도 유지한다.
