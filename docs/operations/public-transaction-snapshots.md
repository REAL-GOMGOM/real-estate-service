# 공개 실거래 serving snapshot 운영 계약

이 모듈은 Mac mini의 로컬 원장을 공개 조회용의 작은 district snapshot으로 변환한 뒤,
검증된 JSON 산출물만 객체 저장소에 발행하기 위한 코어다. DB 조회/export 자체와 기존 API
route 전환은 별도 단계다.

## 공개 범위

- 거래 유형: 매매(`sale`), 전월세(`rent`), 분양권(`presale`)
- 파티션: `lawdCd` 5자리 기준 district별 1개 compact raw snapshot
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
public-transactions/v1/manifest.json
```

변경 불가능한 release 객체:

```text
public-transactions/v1/releases/{YYYYMMDDTHHMMSSZ-hash12}/districts/{lawdCd}.json.gz
public-transactions/v1/releases/{YYYYMMDDTHHMMSSZ-hash12}/artifacts/{name}.json.gz
public-transactions/v1/releases/{YYYYMMDDTHHMMSSZ-hash12}/manifest.json
```

publisher 순서는 district snapshot → named artifact → immutable release manifest → 고정
discovery manifest다. 앞 단계 하나라도 실패하면 discovery manifest를 쓰지 않으므로 독자는
완성되지 않은 release를 발견하지 않는다. 버전 객체는 `max-age=31536000, immutable`, 고정
manifest는 짧은 재검증 캐시를 사용한다.

manifest의 `districts`는 district/기간/유형별 건수와 최신 계약일을 담는 작은 검색 인덱스다.
`namedArtifacts`에는 `summary/districts`, `apartment-index`처럼 route 전환에 필요한 추가
요약을 넣을 수 있다. 모든 named artifact는 아래 envelope로 감싸며 스키마와 건수를
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
검증한다. reader는 체크섬 뒤 JSON schema, 총 건수, 거래 유형별 건수, district/기간 일치를
모두 확인한 후에만 값을 반환한다.

```ts
import { PublicSnapshotReader } from '@/lib/public-snapshots';

const reader = new PublicSnapshotReader({
  baseUrl: process.env.NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL!,
});

const manifest = await reader.getManifest();
const gangnam = await reader.getDistrictSnapshot('11680', manifest);
const summary = await reader.getNamedArtifact('summary/districts', manifest);
```

공개 함수와 반환 타입:

- `getManifest(): Promise<PublicTransactionManifest>`
- `getDistrictSnapshot(lawdCd, manifest?): Promise<PublicTransactionSnapshot>`
- `getNamedArtifact<T>(name, manifest?): Promise<PublicNamedArtifactEnvelope<T>>`

## 안전한 dry-run

R2 필수값 4개가 **모두 없으면** `createPublicSnapshotStoreFromEnv()`는 외부 네트워크를
사용하지 않고 `NAEZIP_SNAPSHOT_DRY_RUN_DIR`에만 기록한다. 일부만 설정되면 조용히
dry-run으로 강등하지 않고 설정 오류로 실패한다.

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

필수 R2 환경변수:

```text
NAEZIP_SNAPSHOT_R2_ACCOUNT_ID
NAEZIP_SNAPSHOT_R2_ACCESS_KEY_ID
NAEZIP_SNAPSHOT_R2_SECRET_ACCESS_KEY
NAEZIP_SNAPSHOT_R2_BUCKET
```

기본 endpoint는 `https://{accountId}.r2.cloudflarestorage.com`이다. 다른 S3-compatible
테스트 저장소에서만 `NAEZIP_SNAPSHOT_R2_ENDPOINT`를 명시한다. 쓰기 자격정보은 Mac mini
publisher에만 두고 `NEXT_PUBLIC_` 변수나 Vercel 브라우저 번들에 넣지 않는다.

## 운영 전 점검

1. 로컬 원장 export가 district별이며 취소 거래를 제외하고 일자 미상은 `YYYY-MM`으로
   보존하는지 확인한다.
2. 자격정보 없이 dry-run을 수행하고 manifest totals와 파일 수를 확인한다.
3. 단위 테스트와 TypeScript/ESLint를 통과시킨다.
4. R2 custom domain, CORS, JSON Cache Everything 규칙을 준비한다.
5. 최소 권한의 단일 bucket 쓰기 토큰을 Mac mini에만 설정한다.
6. 첫 실제 업로드 후 reader로 district와 named artifact를 다시 다운로드해 검증한다.
7. Preview route를 snapshot 우선, 기존 DB를 제한적 fallback으로 전환한 뒤 운영 반영한다.
