# 현장 제보가격 운영

## 범위

- 홈 검색·퀵메뉴 아래 독립 섹션, `/field-reports` 전체(최신 20개), `/admin/field-reports` 검수.
- 단지 식별자는 서버가 검증한 단지 검색 snapshot에서 확인한다. 공개 snapshot 구성 시 조회 실패를 오래된 Neon으로 우회하지 않는다.
- 제보/신고는 **기존 실거래 원장·Blob snapshot·봇 발송·랭킹·평균가격과 완전히 분리**한다.
- 사용자 이름, 연락처, 동·호, 문서, 이미지, 자유 메모는 받지 않는다. 단지·면적·계약일·금액은 제보자 동의 후 공개될 수 있다.
- `pending → published`는 검수 통과일 뿐 거래 사실 인증이 아니다. 거절은 `rejected`, 게시중단은 `hidden`. 자동 국토부 대조·공식 인증은 구현 범위 밖이다.
- 새 제보는 항상 관리자 승인 대기다. 관리자는 전체 목록에서 신고가 없고 공개 기한이 남은 `hidden` 제보만 `다시 게시`할 수 있다. 반려·신고·만료 제보는 재게시하지 않으며, 반려를 숨김으로 바꿔 재게시하는 전이도 차단한다. 재게시해도 원래 공개 만료일과 보관 TTL은 연장하지 않는다.

## 저장소와 활성화

Neon quota 장애에 의존하지 않도록 Upstash REST Redis에 별도 JSON 레코드와 정렬된 검수/공개 인덱스를 저장한다. Redis는 캐시가 아니라 이 기능의 원본 저장소다. 기존 KV/방문자 환경변수의 암묵적 재사용, 메모리/로컬 파일로 성공을 가장하는 폴백은 없다.

서버 전용 설정은 `.env.example`의 `NAEZIP_FIELD_REPORTS_REDIS_SOURCE`, `NAEZIP_FIELD_REPORTS_REDIS_REST_URL`, `NAEZIP_FIELD_REPORTS_REDIS_REST_TOKEN`, `NAEZIP_FIELD_REPORTS_IP_SALT`(32자 이상), `NAEZIP_FIELD_REPORTS_ENABLED`다. 기본 `dedicated`는 제보 전용 자격정보만 읽는다. 운영자가 `visitors`를 명시하면 Vercel 관리 저장소의 `UPSTASH_REDIS_REST_KV_REST_API_URL`/`UPSTASH_REDIS_REST_KV_REST_API_TOKEN`만 사용하며, 해제된 KV나 다른 키로 자동 대체하지 않는다. 어느 경우든 제보 데이터 키와 방문자 통계 키는 분리된다. 새로운 유료 플랜을 자동으로 만들지 않는다.

- namespace: `naezip:field-reports:v1:{development|preview|production}`. `VERCEL_ENV`로 분리하므로 로컬 테스트를 위해 production 값을 주입하지 않는다.
- flag가 `1`이 아니면 신규 접수 차단. 기존 공개 제보의 신고는 저장소와 IP salt가 정상인 동안 유지된다. 저장소 구성 전 GET은 200 + preparing, 구성 후 조회 장애는 503 + unavailable로 구분한다. DB에 저장되지 않은 제보에 성공 메시지를 반환하지 않는다.
- 공개 DTO만 서버에서 30초 재검증/최대 60초 캐시하며 인증·입력 검증을 통과한 검수·숨김 저장 시도 후 `updateTag`로 즉시 만료시킨다. 저장소 응답이 유실된 경우도 포함한다. 브라우저 응답은 `no-store`, 30일 공개기간은 캐시 외부에서도 검사한다.
- 운영 켜기 전: 읽기, 별도 preview 테스트 레코드의 쓰기·검수·숨김·TTL·중복·횟수 제한, admin 권한 검증 및 개인정보/이용기준 안내를 확인한다.
- 신규 저장소 설정 또는 요금제 변경·배포는 별도 승인 없이 실행하지 않는다.
- 점검 갱신(2026-08-31): CLI 인증 저장 권한과 로그인 만료를 해결하고 프로젝트를 확인했다. 기존 `naezip-kv`는 해제됨. `naezip-visitors`는 active/available, Free, Singapore(`sin1`), 자동 유료 전환·eviction·prodPack 모두 false, 사용량 한도 초과 false다. 민감 자격정보는 CLI env pull/run에서 제외되므로 밖으로 복사하지 않고 배포 런타임에서 명시적으로 연결한다.

## 보관/용량/신고

- 레코드와 중복 키 TTL 90일. 검수/신고는 `KEEPTTL`로 만료를 연장하지 않는다.
- 공개는 **접수 시점부터 30일** 이내 `published`만. 만료·거절·숨김·대기 레코드는 공개 DTO에 포함되지 않는다.
- 최대 보관 1,000개. 신규 삽입 시 만료된 인덱스 항목 정리. 용량 한도 도달은 실패 처리하며 기존 레코드를 덮어쓰지 않는다.
- KST 하루 기준 IP 가명값당 접수 3회/신고 10회, 전체 접수 50회/신고 500회. IP 원문은 저장·로그하지 않고 일별 HMAC 키를 최대 48시간 보관. limiter 장애는 fail-closed.
- Lua로 생성·중복 방지·검수·신고·제한 변경을 원자적으로 실행한다. 같은 payload 재시도는 기존 접수번호를 반환한다.
- 신고는 관리자 검토 대상이다. 신고 수만으로 자동 허위판정하거나 공식 지표를 바꾸지 않는다. 관리자 화면은 신고된 공개글·대기글을 먼저 보여준다.
- 과거 레코드의 신고 시각/사유가 모두 누락 또는 null이면 미신고다. 둘 중 하나라도 값이 있으면 잘못된 형식이어도 확인 대상으로 유지한다. 빈 필드 때문에 신고를 만들어 표시하거나 기존 신고 정보를 지워 재게시하지 않는다.
- 삭제/정정 요청은 접수번호로 확인하고 우선 숨김 처리한다. 관리자 원본 삭제 UI는 제공하지 않으므로 즉시 영구삭제 요구는 저장소 운영자가 해당 item과 인덱스·중복 키를 정확히 식별 후 처리한다. 보존기간 동안 별도 무기한 백업은 만들지 않는다.

## 검증

`npm run test:run -- lib/field-reports app/field-reports app/api/field-reports components/field-reports 'app/admin/(protected)/field-reports'`

`npm exec tsc -- --noEmit` 및 `npm run build`.

프로덕션에 가상 제보를 게시해 테스트하지 않는다. 실제 접수번호·미검수 내용·비밀 토큰은 공개 로그에 남기지 않는다.

실제 Lua 검증은 `npm run field-reports:check-store -- --run-required`로 실행할 수 있다. CLI는 `NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_URL`/`NAEZIP_FIELD_REPORTS_TEST_REDIS_REST_TOKEN` 두 테스트 전용 변수만 읽고 `.env`를 자동 로드하지 않는다. 고정 운영 키가 아닌 실행별 `naezip:field-reports:smoke:<UUID>`에서만 쓰기·검수·TTL을 검사한다. 모든 테스트 키는 120초 이내 TTL을 갖고 마지막에 정확한 생성 키만 정리한다.

Vercel의 민감 자격정보를 꺼낼 수 없는 경우 preview 전용 `/api/ops/field-reports-check` POST를 이용한다. `VERCEL_ENV=preview`, `NAEZIP_FIELD_REPORTS_CHECK_ENABLED=1`, 32자 이상 `NAEZIP_FIELD_REPORTS_CHECK_TOKEN` 및 동일한 Bearer 인증이 모두 필요하다. 임의 URL·키·제보 내용은 받지 않는다. 점검은 한 번씩 실행하며 자동 반복 호출하지 않는다. 약 90회 Redis 명령을 사용하고, 지연으로 60초 실행 제한에 걸리면 최종 정리 대신 120초 TTL이 잔여 키를 제거한다.

검증이 끝나면 체크 플래그와 토큰을 제거하고 최종 preview를 재배포한다. **기존 deployment의 환경변수는 바뀌지 않으므로 점검용 deployment 자체도 정확한 ID로 삭제해야 한다.** 최종 preview의 점검 POST가 404임을 확인한다. production과 일반 로컬에서는 항상 404다. `cacheComponents`가 켜져 있으므로 점검 route는 기본 Node 런타임을 사용하고 `runtime` segment export를 추가하지 않는다.

### 2026-08-31 구현 검증 기록

- 전체 단위/컴포넌트 테스트: 176개 파일, 1,525개 테스트 통과. TypeScript 및 변경 파일 ESLint 통과. 점검 route의 Next.js Cache Components 설정 충돌을 수정한 후 로컬 production 빌드 통과.
- 로컬 production 실행에서 메인 검색·퀵메뉴 아래 배치, `/field-reports` 이동, 준비 중 접수 비활성화, 개인정보 안내 앵커, 비로그인 관리자 로그인 화면을 확인했다.
- 데스크톱 및 모바일 390px 뷰포트에서 확인했으며 가로 넘침은 없었다. 실제 제보 카드는 테스트 fixture로만 검증했고 공개 저장소에 예시 데이터를 쓰지 않았다.
- 연결된 Free Upstash의 격리된 smoke namespace에서 실제 Redis Lua를 실행했다. 동시 중복방지, pending 비공개, 90일 TTL/KEEPTTL, 승인·공개 DTO whitelist, 신고·숨김·재공개 차단, 반려·30일 만료·stale index, IP/전체 요청 제한과 정확 키 정리를 모두 통과했다. 관리 저장소의 밀리초 단위 PTTL 감소는 5초 이내의 좁은 허용 오차로 검증한다.
- Preview 브랜치에 `visitors` 저장소를 명시 연결하고 접수를 활성화했다. 점검 플래그와 토큰은 제거했으며, 점검에 사용한 immutable deployment도 삭제한다. 프로덕션 환경변수와 운영 도메인은 변경하지 않았다.
- 2026-09-01 Production에 기존 Free 방문자 Redis를 명시 연결하고 별도 production namespace·전용 IP salt로 접수를 활성화했다. 배포 `dpl_9soGUjSydLQG9ZuKnQEKm9SUeaui`가 Ready 상태로 `www.naezipkorea.com`에 연결됐으며, 공개 API는 `status=ok`·`submissionsEnabled=true`, 점검 route는 404, 초기 공개 제보는 0건임을 확인했다. 검증을 위해 가상 제보를 생성하지 않았다.
- **운영 후 남은 수동 확인:** 실제 이용자의 정상 제보가 접수되면 관리자 계정으로 승인→메인 공개→숨김 UI를 확인한다. 테스트만을 위한 가상 운영 제보는 만들지 않는다.
