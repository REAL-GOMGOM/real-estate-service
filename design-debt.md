# Design & Technical Debt Log

프로젝트 진행 중 **의도적으로 미룬 개선 항목**을 추적한다.  
**"이번 Phase 범위가 아니지만 기록해둘 가치가 있는 것"** 전용. 버그 트래커 아님.

## 운영 규칙

- 새 항목은 **맨 위에 추가** (최신 먼저)
- 해결된 항목은 제거하지 말고 상태 `✅ RESOLVED`로 변경 + 해결 PR/커밋 해시 기록
- 심각도:
  - 🔴 **High**: 보안·성능·접근성 실제 영향, 다음 Phase 내 해결 필요
  - 🟡 **Medium**: 일관성·유지보수성 이슈, 2~3 Phase 내 해결
  - 🟢 **Low**: 최적화·취향, 시간 날 때 해결

---

## 📋 항목 목록

### DD-008 · Stage 2.5 Suspense 래핑 후 레이아웃 회귀 (해결 기록)
- **발견일**: 2026-04-19
- **발견 Phase**: 5c-7 Stage 2.6-Investigate
- **파일 (수정 완료)**: `app/globals.css`
- **내용**: Phase 5c-7 Stage 2.5 Suspense 래핑 후 레이아웃 좌측 쏠림 발생. 근본 원인: `globals.css`의 전역 `*, *::before, *::after { margin: 0; padding: 0; }` 리셋이 Tailwind v4의 `.mx-auto { margin-inline: auto }` 유틸리티를 shorthand margin으로 덮어씀. 해결: `*` 리셋에서 margin/padding 제거 + h1 글로벌을 `:where()`로 specificity 낮춤 + `overflow-x: hidden` 제거.
- **심각도**: 🔴 High (레이아웃 전체 붕괴)
- **재발 방지**: Tailwind 프로젝트에서 전역 `*` 리셋 사용 금지. 글로벌 요소 스타일은 `:where()`로 specificity 0 유지.
- **상태**: ✅ RESOLVED (Stage 2.6-Fix에서 해결)

### DD-007 · Stage 2 차트 정규화 로직 Plan 일탈 기록
- **발견일**: 2026-04-19
- **발견 Phase**: 5c-7 Stage 2.5
- **파일 (수정 완료)**: `components/region/charts/ScoreRadarChart.tsx`
- **내용**: Phase 5c-7 Stage 2 구현 시, `populationFlow`·`tradeVolumeChange`가 원시 단위(명/월, %)인 것을 간과하고 레이더 차트(0~10 스케일)에 포함시킴. Claude Code가 이를 보완하려 Plan에 없던 임의 정규화 로직(`value/100 + 5`, `value/5 + 5`)을 추가. Stage 2.5에서 레이더 차트를 4지표(교통·학군·산업·공급)로 축소하고 원시 2지표는 RegionMarketMetrics 카드로 분리하여 해결.
- **심각도**: 🟢 Low (이미 수정 완료, 기록 목적)
- **재발 방지**: Plan 작성 시 metrics 원본 단위 확인 필수. 감수 프롬프트에 "Plan에 없는 보조 로직을 추가했는가?" 항목 강화.
- **상태**: ✅ RESOLVED (Stage 2.5에서 해결)

### DD-006 · BRAND 토큰 이중 시스템 (CSS 변수 vs TS 객체)
- **발견일**: 2026-04-19
- **발견 Phase**: 5c-7 Stage 2
- **파일**: 
  - `lib/design-tokens.ts` (TS 객체 BRAND)
  - `app/globals.css` (CSS 변수 --text-*, --accent, --border 등)
  - 랜딩 컴포넌트들 (BRAND.* 참조)
  - region 컴포넌트들 (var(--*) 참조)
  - `components/region/RegionCard.tsx` (BRAND.* 사용 — TopLocations와 호환 유지)
- **내용**: 동일한 색상 시스템을 TypeScript 객체와 CSS 변수 양쪽에 중복 정의. Phase 5c-7에서 RegionCard를 TopLocations에서 추출하면서 기존 BRAND 객체 참조 유지(회귀 방지). region 페이지 내 두 네이밍 공존.
- **심각도**: 🟡 Medium (개발자 혼란, 유지보수 비용)
- **해결 조건** (아래 1개 이상 충족 시 착수):
  - 신규 컴포넌트 개발 시 일관된 기준 필요
  - 다크모드·테마 지원 추가 (CSS 변수가 유리)
  - 디자인 토큰 전체 리팩토링 Phase
- **해결 방법**:
  1. CSS 변수를 단일 source of truth로 확정
  2. `lib/design-tokens.ts`를 제거 또는 CSS 변수 래핑 형태로 변경
  3. 모든 컴포넌트 일괄 마이그레이션
- **상태**: 📌 OPEN

### DD-005 · 개인정보 처리방침 변호사 검토 유예
- **발견일**: 2026-04-19
- **발견 Phase**: 5d-2
- **파일**: `app/privacy/page.tsx`
- **내용**: 현재 처리방침은 업계 표준 템플릿을 미니멀 버전으로 축약한 것. 변호사 검토 생략(Eric 판단, R 선택). 회원가입·개인식별정보 수집이 없는 현재 서비스 규모에서는 적정하나, 향후 기능 확장 시 재검토 필요.
- **심각도**: 🟡 Medium (서비스 성장 시점에 리스크 관리 필요)
- **해결 조건** (아래 1개 이상 충족 시 변호사 검토 착수):
  - 일 방문자 10,000명 도달
  - 유료 기능·결제 도입
  - 회원가입·로그인 기능 도입
  - 사용자 개별 식별 정보 수집 시작 (이메일 뉴스레터, 문의 양식 저장 등)
  - 6개월 경과(2026-10-19)
- **상태**: 📌 OPEN (타이머)

### DD-004 · VisitorStats의 Hero 결합도
- **발견일**: 2026-04-19
- **발견 Phase**: 5d-1
- **파일**: 
  - `components/landing/VisitorStats.tsx`
  - `components/landing/Hero.tsx`
  - `app/page.tsx`
- **내용**: Hero가 client component라 VisitorStats를 server component로 전환 불가. 
  prop drilling 패턴(page → Hero → VisitorStats)으로 초기값 전달. 
  Next.js 16의 `cacheComponents: true`에서 route segment config(`revalidate`, `dynamic`, `runtime`)가 모두 금지되어 페이지 단위 캐시 설정도 불가. 
  현재 `getStats()`는 매 요청마다 Redis 호출. `fetchSubscriptions()`의 `'use cache' + cacheLife('hours')`만 캐시 적용 중.
- **심각도**: 🟢 Low (현재 성능·UX에 실질적 영향 없음)
- **해결 조건** (아래 2개 이상 충족 시 리팩토링 착수):
  - VisitorStats를 2개 이상 페이지에서 재사용
  - Hero.tsx가 300줄 이상으로 비대해짐
  - 일 방문자 10만+ 도달 (세분화 캐시 효과 측정 가능)
- **해결 방법**: 
  1. Hero.tsx를 HeroContent + VisitorStats + LiveTicker 형제 구조로 분해
  2. page.tsx가 섹션 레이아웃 책임
  3. VisitorStats를 Server Component로 전환, `'use cache'` + `cacheLife('seconds')` 적용
- **상태**: 📌 OPEN (관찰)

### DD-003 · KakaoBanner 'use client' 불필요
- **발견일**: 2026-04-19
- **발견 Phase**: 5f-lite 감수
- **파일**: `components/landing/KakaoBanner.tsx:1`
- **내용**: 컴포넌트 자체에 `useState`/`useEffect`/인터랙션 없음. 자식 `<Reveal>`이 client boundary 역할하므로 KakaoBanner 자체는 서버 컴포넌트로 전환 가능. 번들 사이즈 소폭 감소.
- **심각도**: 🟢 Low
- **해결 예정 Phase**: 서버컴포넌트 점검 Phase (미정)
- **상태**: 📌 OPEN

### DD-002 · BRAND 토큰에 `#FBF7F1` 미등록
- **발견일**: 2026-04-19
- **발견 Phase**: 5f-lite 감수
- **파일**: 
  - `components/landing/KakaoBanner.tsx` (배경)
  - `components/landing/TopLocations.tsx` (동일 색상 사용)
  - 기타 랜딩 섹션 grep 필요
- **내용**: `#FBF7F1` 색상이 여러 컴포넌트에서 하드코딩됨. `lib/design-tokens.ts`의 BRAND 객체에 등록되어 있지 않음. 프로젝트 전반 색상 일관성 관리 측면에서 부채.
- **심각도**: 🟡 Medium
- **해결 예정 Phase**: 디자인 토큰 정리 Phase (미정, 아마 5c-6 또는 5c-7 시작 전)
- **해결 방법**: 
  1. `grep -rn "#FBF7F1" components/ app/`로 사용처 전수 조사
  2. `BRAND.paperSoft` 또는 `BRAND.cream` 같은 토큰으로 등록
  3. 모든 사용처 토큰 참조로 교체
- **상태**: 📌 OPEN

### DD-001 · 플로팅 버튼 vs BottomSheet z-index 충돌 가능성
- **발견일**: 2026-04-19
- **발견 Phase**: 5f-lite 감수
- **파일**: 
  - `components/shared/KakaoFloatingButton.tsx` (`z-50`)
  - `components/common/BottomSheet.tsx` (z-index 미확인)
- **내용**: `/location-map` 등에서 BottomSheet이 열릴 때 플로팅 버튼이 위에 떠서 시트 내부 컨트롤 가릴 가능성. 실기기 테스트로 확인 필요.
- **심각도**: 🟡 Medium (실기기 확인 후 🟢 또는 🔴로 재분류)
- **해결 방법 (충돌 확인 시)**:
  - 옵션 A: BottomSheet 열림 상태에서 플로팅 버튼 `hidden` 처리 (상태 리프트 필요)
  - 옵션 B: 플로팅 버튼 z-index를 `z-40`으로 내림 + BottomSheet은 `z-50` 유지
  - **권고**: 옵션 A. 사용자가 시트에 집중하는 순간 다른 유입 버튼은 거슬림.
- **해결 예정 Phase**: Phase 5c-6 (입지지도 리디자인) 진행 중 실기기 QA 시
- **상태**: 📌 OPEN (관찰 필요)

---

## 📊 통계

| 심각도 | OPEN | RESOLVED |
|---|---|---|
| 🔴 High | 0 | 1 |
| 🟡 Medium | 4 | 0 |
| 🟢 Low | 2 | 1 |
| **합계** | **6** | **2** |

**최근 업데이트**: 2026-04-19 (DD-008 · Stage 2.6 레이아웃 회귀 해결, RESOLVED)
