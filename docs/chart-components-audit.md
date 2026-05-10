# 차트 컴포넌트 한계 점검 보고서

> 사이클 K 산출물
> HorizontalBarChart 외 2개 컴포넌트의 동일 한계 적용 가능성 분석
> 분석 시점: 2026-05-10

본 사이클(K)에서 HorizontalBarChart에 도입한 4가지 개선:
1. baseline / autoBaseline (큰 값 좁은 범위 강조)
2. maxValue + ▶/◀ 잘림 표시 (이상치 컷오프)
3. zeroX 자동 조정 (긴 라벨 자동 대응 — 신규 props 사용 시만)
4. autoScale (위 항목들에 따른 scale 자동 결정)

이 4가지를 다른 차트 컴포넌트에도 적용해야 할지 점검한다.

---

## DemographicShiftBars

[app/blog/components/DemographicShiftBars.tsx](../app/blog/components/DemographicShiftBars.tsx)

### 구조
- 좌우 대비 차트. 같은 카테고리의 두 값을 *독립적인 박스 두 개*로 그림.
- 박스 폭 = `value × SCALE` (SCALE=2.78 고정).
- 좌측 박스 x=40 시작, 우측 박스 x=590 우측 정렬.
- viewBox 640×380 고정.

### 한계 적용 가능성

| 사이클 K 개선 | 적용 가능 | 사유 |
|---|---|---|
| #1 baseline 0 | **무관** | 좌우 *독립* 박스 — baseline 개념 없음. value별 폭만 결정. |
| #2 음수 처리 | **무관** | 비율(%) 데이터 전제 (예: 거주지 비율). 음수 의미 X. |
| #3 라벨 잘림 | **있음** | sub-label x=100, x=540, delta x=600 모두 매직 넘버. 박스 폭이 클수록 sub-label과 충돌. |
| #4 이상치 | **잠재** | SCALE=2.78 고정. 값이 50% 넘으면 박스 폭 139px > 좌측 영역(0~280) 충돌. |

### 권장 후속 작업 — P3 (낮음)
- 박스 폭 기반 sub-label 위치 자동 조정 (지금은 무조건 x=100·x=540)
- SCALE 자동 (data max 기반) — value > 50%인 데이터 등장 시 필요

발행 글에서 현재 사용된 데이터는 모두 안전한 범위 (kb-report 매수자 거주지 변화는 ~40% 수준). 사용 시점까지는 회피 가능.

---

## AgeGroupBars

[app/blog/components/AgeGroupBars.tsx](../app/blog/components/AgeGroupBars.tsx)

### 구조
- 그룹 막대 차트 (세로 막대). before/after 두 값을 그룹별로 비교.
- yMax prop 있음 (default 40), `pxPerPercent = PLOT_HEIGHT / yMax`로 동적 scale.
- 그룹 폭 90, 그룹 간격 150 (`GROUP_PITCH=150`) 고정.
- viewBox 640×360 고정.

### 한계 적용 가능성

| 사이클 K 개선 | 적용 가능 | 사유 |
|---|---|---|
| #1 baseline 0 | **부분** | Y_AXIS_BOTTOM=0 고정. % 데이터라 0 baseline이 자연스러움. 비율 데이터에 baseline=20 같은 옵션은 의미 작음. |
| #2 음수 처리 | **잠재** | 현재 음수 미지원 (Y축 양수 영역만). 데이터 특성상 음수 발생 가능성 낮음. |
| #3 라벨 잘림 | **있음** | GROUP_PITCH=150 고정. 그룹 4개면 X_START(80) + 65 + 3*150 = 595 → X_END(600)에 거의 닿음. 5개면 viewBox 초과. |
| #4 이상치 | **이미 해결** | `yMax` prop이 막대 위쪽 절단 역할 수행. value가 yMax 초과 시 막대가 viewBox를 벗어나지만, 사용자가 yMax 조정 가능. |

### 권장 후속 작업 — P3 (낮음)
- GROUP_PITCH 자동 또는 viewBox·X_END 동적 (그룹 5개 이상 사용 시 필요)
- yMax 자동 (data max 기반 — auto-yMax) — 사용자가 yMax 매번 지정해야 하는 부담

발행 글에서 현재 사용된 데이터는 모두 그룹 3-4개. 단기적으로 회피 가능.

---

## 우선순위

| 작업 | 우선순위 | 사유 |
|---|---|---|
| HorizontalBarChart 개선 (사이클 K) | **P0 — 완료** | kb-report 시리즈 다수 차트 사용. 큰 값 좁은 범위·이상치·라벨 잘림 모두 발생 |
| DemographicShiftBars sub-label 자동 위치 | P3 | 현재 발행 글 데이터 안전 범위. 새 데이터 사용 시 발생 가능 |
| DemographicShiftBars SCALE 자동 | P3 | value 50%+ 데이터 등장 시 |
| AgeGroupBars GROUP_PITCH 동적 | P3 | 그룹 5개+ 사용 시. 현재 발행 글 모두 4개 이하 |
| AgeGroupBars yMax 자동 | P4 | 편의 개선. 현재 yMax 명시적 지정으로 충분 |

음수 처리는 두 컴포넌트 모두 데이터 특성상 발생 가능성 낮아 후순위.

---

## 메타 — 사이클 K 회귀 보장 결과

HorizontalBarChart 사이클 K 변경에 대한 4중 방어선 통과 결과:

1. ✓ default 값: `baseline=undefined`, `autoBaseline=false`, `maxValue=undefined`, `autoScale=undefined` → 기존 분기 그대로
2. ✓ `useAutoLayout` 게이트: 신규 prop 미사용 시 zeroX·scale 모두 사용자 지정값/default 그대로
3. ✓ 단위 테스트 회귀: 발행 글 4개의 데이터로 `computeBarWidth(value, 0, scale)`이 `Math.abs(value) × scale`과 일치 검증
4. ✓ SVG 렌더 회귀: `renderToStaticMarkup` 결과에서 클립 마커·캡션 미존재, `viewBox`·`<rect>` 개수·축 라벨 모두 기존 동작과 일치

---

## 관련 문서

- [app/blog/components/HorizontalBarChart.tsx](../app/blog/components/HorizontalBarChart.tsx) — 본체
- [app/blog/components/HorizontalBarChart.utils.ts](../app/blog/components/HorizontalBarChart.utils.ts) — 순수 함수
- [app/blog/components/__tests__/HorizontalBarChart.test.ts](../app/blog/components/__tests__/HorizontalBarChart.test.ts) — 단위 + 회귀 테스트
