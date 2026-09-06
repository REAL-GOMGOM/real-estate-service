# 공개 칼럼 임시 숨김 — 2026-09-06

당분간 칼럼을 발행할 계획이 없다는 운영자 요청에 따라 공개 진입점을 잠시 닫는다. 글 삭제나 DB 정리는 하지 않는다.

## 범위와 재개 방법

- `lib/public-features.ts`의 `isPublicBlogEnabled()`를 단일 빌드 시점 정책으로 사용한다. 현재 `false`이며 서버와 클라이언트가 동일한 상태를 사용한다.
- 홈·공통 헤더·모바일 메뉴·하단 더보기에서 칼럼을 숨긴다. 홈 소개 문구는 그대로 유지하고 텔레그램 안내의 새 칼럼 홍보만 정리한다.
- 공개 페이지 `/blog`, 상세, 카테고리는 쿼리 문자열을 제거하고 홈으로 307 임시 이동한다. `no-store`, `noindex`, `X-Naezip-Data-Status: paused`를 제공한다.
- 칼럼 OG 요청은 글 조회 없이 기본 OG 이미지로 307 이동한다. RSS는 HTML로 이동시키지 않는다.
- RSS는 항목과 가짜 발행 시각이 없는 빈 피드, `/api/blog/feed`는 `{status:'paused',data:[]}`를 HTTP 200으로 반환한다. 모두 `no-store`/`noindex` 및 paused 상태 헤더를 제공한다. 새 글 알림 항목을 만들지 않는다.
- 사이트맵의 칼럼 URL과 공개 글·카테고리 조회를 중단한다. 페이지 metadata와 빌드 단계에서도 조회 이전에 중단한다.
- 원본 글·카테고리·관리자·서명 미리보기·자동 발행 API·백업은 변경하지 않았다. 기존 `/report`의 영구 `/blog` 이동 설정은 그대로이며 이후 새 임시 홈 이동을 따른다.
- 재개할 때는 공개 원본/manifest 상태를 먼저 확인하고 플래그를 `true`로 바꿔 테스트·배포한다. 원본을 삭제하거나 별도 환경변수를 바꿀 필요가 없다. 이번 변경은 기존 원본 복구를 의미하지 않는다.

## 검증

- 전체 194개 파일 / 1,860개 테스트, 전체 ESLint, `tsc --noEmit --incremental false`, `git diff --check`, Webpack 프로덕션 빌드 통과.
- 비활성 상태의 미조회·빈 피드·임시 이동과 활성 상태의 기존 동작을 함께 테스트했다.
- 독립 읽기 전용 코드 리뷰에서 수정이 필요한 문제를 발견하지 못했다.
- 로컬 HTTP: 인덱스/상세/카테고리 307 홈 이동, OG 307 기본 이미지, RSS/feed 200 paused/no-store, sitemap 칼럼 URL 0건 확인.
- 로컬 PC·390×844 모바일 브라우저: 상단/하단 메뉴에 칼럼 없음, 기존 칼럼 링크에서 홈 이동, 텔레그램 안내에 칼럼 없음, 실거래·뉴스 정상 표시, 브라우저 오류 없음. 임시 탭을 닫고 viewport와 개발 서버를 종료했다.
- 프로덕션 빌드에서 기존 공개 블로그 manifest 경고가 발생하지 않았다. 다른 API의 기존 동적 prerender 이탈 진단은 남아 있으며 이번 범위가 아니다.
- 제보 제출·텔레그램 메시지·글 작성/수정·DB 삭제는 실행하지 않았다.

## 배포

- 반영 전 복귀 기준: `dpl_MZtvCV2Wy2v7hkdEVPnosSkuk12H` / `real-estate-service-2jcggk7l2-real-gomgoms-projects.vercel.app`.
- 운영 URL: [www.naezipkorea.com](https://www.naezipkorea.com/). 2026-09-06 운영 반영 완료.
- 배포: [o029uf34c](https://real-estate-service-o029uf34c-real-gomgoms-projects.vercel.app/), ID `dpl_J6ZvFrAfkUq6yzLu8WBSFe796db2`, 상태 `READY`, 코드 커밋 `3bded46`, Next.js 16.2.11. 원격 빌드 시작부터 준비 완료까지 약 105초.
- 운영 설정 원격 빌드 → `--skip-domain` 별도 검증 → 승격 순서로 반영했다. 승격 직전까지 `www`가 이전 배포를 가리키고, 이후 새 배포를 가리키는지 Vercel 조회로 각각 확인했다.
- RSS/feed는 Vercel에서 `PRERENDER`로 생성되어도 실제 HTTP 응답에 `Cache-Control: no-store`가 유지됨을 별도 검증 URL과 인증 없는 운영 URL 양쪽에서 확인했다. RSS 항목/발행시각 없음, feed `paused`/빈 배열 유지.
- 운영 공개 GET: 칼럼 인덱스·상세·카테고리 307 홈 이동, OG 307 기본 이미지 이동, sitemap 칼럼 URL 0건. 은마 매매 4건·가람 전세 2건 모두 200, 현장 제보 피드 200/`status:ok`/`submissionsEnabled:true` 유지.
- 운영 PC·모바일 화면에서 칼럼 링크 0건, 하단 더보기 목록 정상, 기존 홈 소개 문구·실거래·제보 버튼 유지, 모바일 가로 넘침 및 브라우저 오류 없음을 확인했다. 임시 브라우저 탭을 닫고 viewport를 원복했다.
- 새 배포를 지정한 최근 1시간 `error`/`fatal` 런타임 로그 조회 결과 없음. 점검 범위의 결과이며 지속 감시나 사이트 전체 무오류를 보장하지 않는다. 로그 drain 설정은 이번에 변경하거나 감사하지 않았다.
