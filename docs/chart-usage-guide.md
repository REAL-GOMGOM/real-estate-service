# 차트 12종 사용 가이드

> **Phase 8-4a 산출물 · 작성 시점**: HEAD `25d38c6` (Phase 8-1 가드 도입 후)
>
> **용도**:
> 1. 어드민에서 글 직접 작성 시 차트 형식 레퍼런스
> 2. 자동 발행(LLM) 프롬프트 교정 기준 — 잘못된 형식 차단
>
> **정확성 근거**: 본 문서의 모든 props 사양·예시는 `app/blog/components/*.tsx`의 실제 TypeScript 인터페이스에서 추출한 값. 추측·요약 아님.
>
> **방어 동작**: 형식이 틀려도 페이지는 **죽지 않음**(Phase 8-1 가드). 대신 해당 차트만 "차트를 표시할 수 없습니다" placeholder로 표시됨 → **차트가 안 보임**. 형식을 정확히 지킬 것.

---

## 0. 공통 — 색상 시스템

차트의 색상은 두 방식 모두 받는다 (`lib/chart-colors.ts`의 `ChartColor` 타입).

### 0-1. 키워드 7색 (권장 — 시각 일관성)

| 키워드 | hex | 용도 |
|---|---|---|
| `'red'` | `#dc2626` | 강조·상승·서울 |
| `'orange'` | `#ea580c` | 보조 강조 |
| `'blue'` | `#2563eb` | 하락·대비 |
| `'darkBlue'` | `#1d4ed8` | 하락 강조 |
| `'gray'` | `#6b7280` | 중립·기준값 |
| `'yellow'` | `#fbbf24` | **DemographicShiftBars 전용** |
| `'amberOrange'` | `#f97316` | **DemographicShiftBars 전용** (표준 orange와 톤 다름) |

### 0-2. hex 직접 입력

```
color="#9ca3af"
```
- 3·4·6·8자리 표준 hex 지원
- 자유 색상이 필요한 경우만 사용. 디자인 일관성을 위해 키워드 권장

### 0-3. color 미지정(자동 할당)

차트별로 5색 순환 (yellow/amberOrange는 자동 할당에서 제외):
- **category intent** (`HorizontalBarChart`/`DonutChart`/`StackedBarChart`/`ScatterPlot`/`RangeBarChart`): `red → blue → orange → darkBlue → gray`
- **series intent** (`LineChart`/`AreaChart`): `gray → red → blue → orange → darkBlue`. 단, **단일 시리즈 + color 미지정 → `blue` 강제**

---

## 1. LineChart — 시계열 추세 / 다중 시리즈

**용도**: 시간(또는 카테고리) 축에 따라 한 개 이상 시리즈의 값 변화 표시.

### Required
- `title: string`
- `series: LineSeries[]`
  - `LineSeries = { name: string; color?: ChartColor; data: LinePoint[]; filled?: boolean; dashed?: boolean }`
  - `LinePoint = { x: string | number; y: number }`

### Optional
`unit` ('%' default) · `xAxisLabel` · `yAxisLabel` · `width`(640) · `height`(360) · `baseline` · `autoBaseline`(false) · `maxValue` · `showGrid`(true) · `showLegend`(다중 시리즈 시 자동) · `showDots`(true) · `gradientDots`(false) · `ariaDesc`

### 최소 예시 (복사 가능)

```mdx
<LineChart
  title="자치구별 평당가 추이"
  unit="만원"
  series={[
    { name: '강남', data: [{ x: '2022', y: 7800 }, { x: '2023', y: 8200 }, { x: '2024', y: 9500 }] },
    { name: '서초', data: [{ x: '2022', y: 7200 }, { x: '2023', y: 7600 }, { x: '2024', y: 8800 }] }
  ]}
/>
```

### ⚠️ 흔한 실수 (실제 페이지 다운 케이스)

```mdx
<!-- ❌ 작동하지 않음 — 페이지에 placeholder만 보임 -->
<LineChart title="..." unit="%" data={[
  { label: '2월', 동탄: 0.78, 구리: 1.77, 기흥: 0.70 }
]} />
```

- `data` prop은 **없음**. `series`로 작성해야 함.
- 데이터 모양도 다름: **wide format(컬럼)** ❌ → **long format(시리즈별 x/y)** ✅

올바른 형태:
```mdx
<LineChart
  title="지역별 변동률"
  unit="%"
  series={[
    { name: '동탄', data: [{ x: '2월', y: 0.78 }] },
    { name: '구리', data: [{ x: '2월', y: 1.77 }] },
    { name: '기흥', data: [{ x: '2월', y: 0.70 }] }
  ]}
/>
```

---

## 2. AreaChart — 시계열 면적 / 누적

**용도**: 시계열 추세를 면적으로 강조. `stacked`로 시리즈 누적도 가능.

### Required
- `title: string`
- `series: AreaSeries[]`
  - `AreaSeries = { name: string; color?: ChartColor; data: AreaPoint[] }`
  - `AreaPoint = { x: string | number; y: number }`

### Optional
`unit`('%') · `xAxisLabel` · `yAxisLabel` · `width`(640) · `height`(360) · `baseline` · `autoBaseline`(false) · `maxValue` · **`stacked`(false — true면 시리즈 누적)** · `showGrid`(true) · `showLegend`(자동) · `ariaDesc`

### 최소 예시

```mdx
<AreaChart
  title="강남 시세"
  unit="억"
  series={[
    { name: '평균가', data: [{ x: '2022', y: 22 }, { x: '2023', y: 28 }, { x: '2024', y: 33 }] }
  ]}
/>
```

### stacked 누적 예시
```mdx
<AreaChart
  title="자치구별 거래량 누적"
  unit="건"
  stacked
  series={[
    { name: '강남', data: [{ x: 'Q1', y: 120 }, { x: 'Q2', y: 145 }] },
    { name: '서초', data: [{ x: 'Q1', y: 90 }, { x: 'Q2', y: 105 }] }
  ]}
/>
```

### ⚠️ 흔한 실수
- LineChart와 동일: `data` prop으로 시도 ❌ → `series` ✅
- 누적 모드(`stacked={true}`)에서 같은 x값을 공유하지 않으면 누적이 어색해짐 — 모든 시리즈가 같은 x 집합을 가지도록

---

## 3. HorizontalBarChart — 가로 막대 / 지역·항목별 값

**용도**: 자치구·지역·항목별 단일 값을 가로 막대로 비교. KB-Report 시리즈의 표준.

### Required
- `title: string`
- `data: BarRow[]`
  - `BarRow = { label: string; value: number; color?: ChartColor }`

### Optional
`unit`('%') · `dividerAfter` (분리선 뒤 행 index, 예: 상위 10 후 점선 → 9) · `dividerText` (분리선 옆 텍스트) · `width`(640) · `zeroX`(200) · `scale`(10 — 1unit=10px) · `colorMode`('discrete'|'gradient') · `baseline` · `autoBaseline` · `maxValue` · `autoScale`

### 최소 예시

```mdx
<HorizontalBarChart
  title="자치구별 변동률"
  unit="%"
  data={[
    { label: '강남', value: 24.0, color: 'red' },
    { label: '서초', value: 18.5, color: 'red' },
    { label: '송파', value: 12.3, color: 'orange' },
    { label: '용산', value: -3.2, color: 'blue' }
  ]}
/>
```

### gradient 모드 (값에 따라 자동 색상)
```mdx
<HorizontalBarChart
  title="서울 25개 자치구 변동률"
  unit="%"
  colorMode="gradient"
  data={[
    { label: '강남', value: 18 },
    { label: '서초', value: 13 },
    /* ... */
  ]}
/>
```

### ⚠️ 흔한 실수 — 막대가 전부 풀길이로 깨짐

- 기본 `scale=10` (1unit=10px). `value`가 큰 절댓값(100+)이면 막대 폭이 viewBox(640) 초과 → **막대 전부 풀길이로 보임**
- 비율(0~1)을 unit="%"로 표시하려면 미리 100배 곱해서 입력 (값이 0.78이면 78로). 또는 `autoScale` 사용
- `dividerText="%"`로 단위를 표시하려고 우회하지 말 것 → 그건 분리선 설명용. `unit="%"`로 명시

---

## 4. DonutChart — 비율·점유율 (도넛/파이)

**용도**: 카테고리별 비율, 매수자 분포 등.

### Required
- `title: string`
- `data: DonutSlice[]`
  - `DonutSlice = { label: string; value: number; color?: ChartColor; highlighted?: boolean }`

### Optional
`unit`('%') · `size`(360 — 차트 크기) · `innerRadius` (미지정 시 `size × 0.32`. `0`이면 Pie) · `showLabels`(true) · `showPercentages`(true) · `centerText` · `centerSubtext` · `ariaDesc`

### 최소 예시

```mdx
<DonutChart
  title="매수자 거주지 분포"
  data={[
    { label: '강남3구', value: 43.1, highlighted: true },
    { label: '강북',    value: 28.5 },
    { label: '경기',    value: 18.2 },
    { label: '인천',    value: 10.2 }
  ]}
  centerText="100%"
  centerSubtext="2024년 기준"
/>
```

### ⚠️ 흔한 실수
- `value`에 음수 입력 → 0으로 sanitize됨(차트는 정상이지만 데이터 의미 손실)
- `data` 누락 또는 배열 아님 → placeholder

---

## 5. StackedBarChart — 다중 세그먼트 누적 막대 (세로)

**용도**: 각 카테고리(분기·자치구)의 세그먼트 누적 비교.

### Required
- `bars: StackedBar[]`
  - `StackedBar = { label: string; segments: StackedSegment[] }`
  - `StackedSegment = { label: string; value: number; color?: ChartColor }`

### Optional
**⚠️ `title`은 optional** (다른 차트와 다름) · **`unit` default `''`**(빈 문자열! 다른 차트는 '%') · `percentMode`(false — true면 각 bar 합계 100% 정규화) · `showSegmentLabels`(false) · `showLegend`(자동) · `width`(640) · `height`(360) · `ariaDesc`

### 최소 예시

```mdx
<StackedBarChart
  title="분기별 거래 유형"
  unit="건"
  bars={[
    { label: 'Q1', segments: [
      { label: '아파트', value: 120, color: 'red' },
      { label: '오피스텔', value: 30, color: 'blue' }
    ]},
    { label: 'Q2', segments: [
      { label: '아파트', value: 145, color: 'red' },
      { label: '오피스텔', value: 25, color: 'blue' }
    ]}
  ]}
/>
```

### percentMode (각 bar 100% 정규화)
```mdx
<StackedBarChart
  title="자치구별 매수자 비율"
  unit="%"
  percentMode
  bars={[
    { label: '강남', segments: [
      { label: '강남3구', value: 43 },
      { label: '경기', value: 30 },
      { label: '기타', value: 27 }
    ]}
  ]}
/>
```

### ⚠️ 흔한 실수
- `bars[].segments`를 누락 → placeholder
- `unit` 미지정 + 실제 단위는 '%' → 값 라벨이 단위 없이 표시됨. `unit="%"` 명시할 것

---

## 6. ScatterPlot — 산점도 (x·y 상관)

**용도**: 평형 대비 가격, 연식 대비 시세 등 두 수치의 분포·상관.

### Required
- `title: string`
- `groups: ScatterGroup[]`
  - `ScatterGroup = { name: string; color?: ChartColor; dots: ScatterDot[] }`
  - `ScatterDot = { x: number; y: number; label?: string }` — **x와 y는 모두 숫자**

### Optional
`xUnit`('') · `yUnit`('') · `xAxisLabel` · `yAxisLabel` · `width`(640) · `height`(400) · `xMin` · `xMax` · `yMin` · `yMax` · `showGrid`(true) · `showLegend`(자동) · `dotRadius`(5) · `ariaDesc`

### 최소 예시

```mdx
<ScatterPlot
  title="평형 대비 가격"
  xUnit="평"
  yUnit="억"
  groups={[
    { name: '강남', dots: [
      { x: 25, y: 18, label: '강남자이' },
      { x: 33, y: 26 },
      { x: 42, y: 38 }
    ]},
    { name: '서초', dots: [
      { x: 28, y: 18 },
      { x: 35, y: 24 }
    ]}
  ]}
/>
```

### ⚠️ 흔한 실수
- `dots[].x`나 `dots[].y`를 문자열로 입력 (예: `x: "25평"`) → ScatterPlot은 LineChart와 달리 양축 모두 **숫자만**. 단위는 `xUnit`/`yUnit`으로 분리

---

## 7. SparkLine — 인라인 미니 추세선

**용도**: 텍스트 흐름 속에 추세를 작은 선으로 표시 (속도계 등 인라인 강조).

### Required
- `data: number[]` — 그냥 숫자 배열
- **`ariaLabel: string`** — **필수** (다른 차트와 달리 인라인이라 desc 자동 생성 안 함)

### Optional
`width`(120) · `height`(32) · `color` · `showEndDot`(true) · `showArea`(false) · `trendColor`(true — true면 상승 red / 하락 blue / 평평 gray 자동)

### 최소 예시 — 인라인

```mdx
군포시 시세는 최근 <SparkLine data={[10, 12, 14, 18, 22, 28]} ariaLabel="군포시 상승세" /> 상승세입니다.
```

### color 명시
```mdx
<SparkLine data={[10, 12, 14, 18, 22]} color="darkBlue" ariaLabel="강남 시세" />
```

### ⚠️ 흔한 실수
- **`ariaLabel` 누락 → TypeScript 컴파일 실패(strict 검증)**. 인라인 차트도 접근성 텍스트가 반드시 필요
- 다른 차트처럼 `data: [{x, y}]` 형식으로 작성 ❌ → SparkLine은 **그냥 숫자 배열** `data: [10, 20, 30]`

---

## 8. RangeBarChart — 범위 막대 (min~max 밴드)

**용도**: 단지별 실거래 최저~최고가, 평형별 시세 밴드 등.

### Required
- `title: string`
- `items: RangeItem[]`
  - `RangeItem = { label: string; min: number; max: number; color?: ChartColor }`

### Optional
`unit`('%') · `width`(640) · `height` (미지정 시 항목 수 기반 동적) · `domainMin` · `domainMax` · `showValues`(true) · `showMidpoint`(false — 막대 중앙 흰색 세로선) · `barHeight`(24) · `ariaDesc`

### 최소 예시

```mdx
<RangeBarChart
  title="단지별 실거래 시세"
  unit="억"
  items={[
    { label: '강남자이',   min: 22, max: 38 },
    { label: '래미안',     min: 18, max: 30 },
    { label: '디에이치',   min: 25, max: 32, color: 'darkBlue' }
  ]}
/>
```

### ⚠️ 흔한 실수
- `min == max`인 점 막대도 자동으로 2px 가는 막대로 표시됨(가드). 일부러 0폭으로 만들 필요 없음
- 도메인 양 끝에 붙는 값 + 긴 unit("만 원/평") → 라벨이 viewBox 밖으로 살짝 나갈 수 있음. `width` 늘리거나 unit 짧게

---

## 9. GaugeChart — 반원 게이지

**용도**: 단일 값을 비율로 표시. 전고점 회복률, 공급 대비 수요율.

### Required
- `title: string`
- **`value: number`** — **유한수** (NaN, `undefined`, 문자열 ❌)

### Optional
`min`(0) · `max`(100) · `unit`('%') · `width`(320) · `height`(200) · `zones?: GaugeZone[]` (`{ upTo: number; color: ChartColor }`) · `color` · **`startAngle`(180) · `endAngle`(0)** · `showValue`(true) · `thickness`(24) · `ariaDesc`

### 최소 예시

```mdx
<GaugeChart title="회복률" value={62} />
```

### zones 3구간

```mdx
<GaugeChart
  title="전고점 회복률"
  value={62}
  zones={[
    { upTo: 30,  color: 'blue' },
    { upTo: 70,  color: 'orange' },
    { upTo: 100, color: 'red' }
  ]}
/>
```

### ⚠️ 흔한 실수 — 게이지 뒤집힘 (실제 발생)

- **각도 컨벤션을 꼭 확인**: default `startAngle=180`(좌측 9시) → `endAngle=0`(우측 3시). 진행 방향은 angle 감소 → **상단 반원**(좌→상→우, 속도계 형태)
- **`startAngle=0, endAngle=180`로 작성하면 호가 아래쪽으로 뒤집힘**. default 값을 바꾸지 말 것
- `value`를 누락하거나 `NaN`이면 placeholder
- `max <= min`이면 "비정상 범위" placeholder

### 색상 우선순위
1. `zones` 명시 → `value <= upTo` 첫 매칭 구간색
2. `zones` 없고 `color` 명시 → 그 색상
3. 둘 다 없음 → 값에 따라 gradient 자동

---

## 10. HeatMap — 2D 격자 히트맵

**용도**: 지역×기간 변동률, 평형×층 시세 분포.

### Required
- `title: string`
- `rows: string[]` (y축 라벨)
- `cols: string[]` (x축 라벨)
- **`values: (number | null)[][]`** — **2차원 배열**. `null`은 데이터 없음(회색 셀)

### Optional
`unit`('%') · `width`(640) · `height` (행 수 기반 동적) · `showValues`(true — 셀 안 값 표시) · `cellGap`(2) · `ariaDesc` · `colorScale?: (value: number) => string` (커스텀 색상 함수)

### 최소 예시

```mdx
<HeatMap
  title="자치구×분기 변동률"
  unit="%"
  rows={['강남', '서초', '송파']}
  cols={['Q1', 'Q2', 'Q3', 'Q4']}
  values={[
    [12,  8, -2, 15],
    [10,  6, -3, 13],
    [ 8,  4, -5, 11]
  ]}
/>
```

### null 셀 (데이터 누락)
```mdx
<HeatMap
  title="데이터 누락 포함"
  rows={['1월', '2월', '3월']}
  cols={['강남', '서초', '송파']}
  values={[
    [10,   null, 15],
    [null, 12,   18],
    [ 8,    9, null]
  ]}
/>
```

### ⚠️ 흔한 실수
- `values`의 행 수와 `rows.length` 불일치 → 빈 행이 회색
- `values`의 각 행의 열 수와 `cols.length` 불일치 → 일부 셀 회색
- 1차원 배열로 주는 실수 ❌ — **반드시 2차원 `[[1,2,3],[4,5,6]]`**
- `colorScale`은 함수 prop — **server component에서 client component로 함수 전달 제한** 때문에 페이지 자체가 server라면 server→client 함수 전달 에러. 일반적인 MDX 본문에서는 문제 없음(MDX 렌더 자체가 client)

---

## 11. DemographicShiftBars — 좌우 대비 막대 (1차 vs 2차)

**용도**: 거주지·출신지 같은 카테고리별 1차/2차 비교 (예: KB-Report 매수자 거주지 변화).

### Required
- `title: string`
- `leftHeader: { label: string; subLabel: string }`
- `rightHeader: { label: string; subLabel: string }`
- `categories: CategoryRow[]`
  - `CategoryRow = { label: string; leftValue: number; rightValue: number; color: 'yellow' | 'amberOrange' | 'red' }` — **color는 필수, 3종만 허용**

### Optional
`caption`

### 최소 예시

```mdx
<DemographicShiftBars
  title="강남3구 매수자 거주지 변화"
  leftHeader={{ label: '1차 상승기', subLabel: '2020~2021' }}
  rightHeader={{ label: '2차 상승기', subLabel: '2023~2024' }}
  categories={[
    { label: '강남3구', leftValue: 43.1, rightValue: 39.6, color: 'yellow' },
    { label: '강북',    leftValue: 28.5, rightValue: 32.0, color: 'amberOrange' },
    { label: '경기',    leftValue: 18.2, rightValue: 22.4, color: 'red' }
  ]}
  caption="단위: %, 매수자 거주지 기준"
/>
```

### ⚠️ 흔한 실수
- `color`에 표준 5색(`'blue'`, `'orange'`, `'darkBlue'`, `'gray'`) 사용 ❌ → TypeScript 컴파일 실패. **이 차트만 `'yellow' | 'amberOrange' | 'red'` 3종**
- `'orange'`로 작성 ❌ → `'amberOrange'`로 작성해야 함(amber 톤이 본 차트 디자인 의도)
- `color` 누락 ❌ — 필수 prop. 다른 차트는 optional이지만 이 차트는 명시 필수
- `leftValue`/`rightValue`가 50% 넘으면 박스 폭이 좌측 영역 넘어가 깨질 수 있음 (백로그 [chart-components-audit.md](./chart-components-audit.md) 참조)

---

## 12. AgeGroupBars — 연령·세그먼트 before/after 비교

**용도**: 1차/2차 매수자 연령대 비교 등 같은 그룹의 두 시점 비교 (세로 막대).

### Required
- `title: string`
- `beforeLabel: string` · `afterLabel: string` (범례 표시 라벨)
- `groups: AgeGroup[]`
  - `AgeGroup = { label: string; beforeValue: number; afterValue: number; delta?: { text: string; type: 'up' | 'down' } }`

### Optional
`yMax`(40 — Y축 최대값 % 기준)

### 색상 (변경 불가)
- before 막대: `#94a3b8` (slate gray) 고정
- after 막대: `#dc2626` (red) 고정
- **`color` prop 없음**. 작가가 색상 변경 불가

### 최소 예시

```mdx
<AgeGroupBars
  title="1차 vs 2차 상승기 매수자 연령"
  beforeLabel="1차"
  afterLabel="2차"
  groups={[
    { label: '20대', beforeValue: 12, afterValue: 18, delta: { text: '+6%p', type: 'up' } },
    { label: '30대', beforeValue: 32, afterValue: 28, delta: { text: '-4%p', type: 'down' } },
    { label: '40대', beforeValue: 28, afterValue: 26 },
    { label: '50대', beforeValue: 15, afterValue: 18 }
  ]}
/>
```

### ⚠️ 흔한 실수
- `color` prop 시도 ❌ — 컴포넌트에 그 prop 자체가 없음. 색상 커스터마이즈 불가
- `beforeValue` 또는 `afterValue`가 `yMax`(default 40) 넘으면 막대가 viewBox를 벗어남. 큰 값이면 `yMax` 명시
- 그룹 5개 이상은 viewBox 폭 초과 가능 — 4개 이하 권장

---

## 13. 흔한 실수 모음 (재발 방지 체크리스트)

이번 진단(Phase 8-1 이전)에서 실제 페이지 다운/시각 깨짐을 일으킨 케이스들:

1. **LineChart에 `series` 대신 `data` 사용** → 페이지 전체 다운(현재는 placeholder)
   ```
   ❌ <LineChart data={[{label:'2월', 동탄:0.78, 구리:1.77}]} />
   ✅ <LineChart series={[{name:'동탄', data:[{x:'2월', y:0.78}]}, ...]} />
   ```

2. **GaugeChart `startAngle`/`endAngle` 잘못 입력 → 호 뒤집힘**
   ```
   ❌ <GaugeChart value={62} startAngle={0} endAngle={180} />  (아래 반원)
   ✅ <GaugeChart value={62} />  (default 180→0, 상단 반원)
   ```

3. **DemographicShiftBars `color`에 표준 5색 사용**
   ```
   ❌ color: 'orange'  → 컴파일 실패
   ✅ color: 'amberOrange'  (또는 'yellow', 'red' 셋 중 하나)
   ```

4. **HorizontalBarChart 큰 절댓값 + 기본 scale → 막대 풀길이 깨짐**
   ```
   ❌ <HorizontalBarChart unit="%" data={[{label:'A', value:4618}]} />
      (default scale=10 → 46180px 막대, viewBox 폭 640 초과)
   ✅ autoScale 사용 또는 unit/scale 명시:
      <HorizontalBarChart unit="조" autoScale data={[{label:'A', value:4618}]} />
   ```

5. **SparkLine `ariaLabel` 누락**
   ```
   ❌ <SparkLine data={[10,20,30]} />  → TS 컴파일 실패 (required)
   ✅ <SparkLine data={[10,20,30]} ariaLabel="강남 시세 추이" />
   ```

6. **HeatMap `values`를 1차원으로**
   ```
   ❌ values={[10, 20, 30]}
   ✅ values={[[10, 20, 30]]}  (반드시 2차원)
   ```

7. **GaugeChart `value` NaN/문자열/누락**
   ```
   ❌ <GaugeChart value="50" />  또는 value={NaN}  → placeholder
   ✅ <GaugeChart value={50} />
   ```

8. **StackedBarChart `bars[].segments` 누락**
   ```
   ❌ bars={[{label: 'Q1'}]}
   ✅ bars={[{label: 'Q1', segments: [{label: 'A', value: 60}, ...]}]}
   ```

---

## 14. Phase 8-1 방어 동작 안내

차트 12종은 **잘못된 props가 와도 throw하지 않음**(Phase 8-1, commit `25d38c6`).

### 작가가 경험하는 동작
- 형식이 맞으면 정상 차트 렌더
- 형식이 틀리면 해당 차트만 **회색 점선 박스 + "차트를 표시할 수 없습니다"**
- **개발 환경(dev)**에서는 추가로 `[차트명] 구체 이유` 노출 (예: `[LineChart] series prop이 배열이 아닙니다`)
- **본문의 다른 부분은 살아남음** — 글 전체가 죽지 않음

### LLM 자동 발행 측 권장사항
- 본 문서의 "흔한 실수" 8건을 프롬프트 가드에 포함
- 생성 후 dev 환경에서 placeholder가 발생한 차트가 있는지 미리보기로 확인 → 재생성

---

## 15. 차트 선택 가이드 (데이터 유형 → 차트)

| 데이터 유형 | 권장 차트 |
|---|---|
| 시계열 추세 (1개 시리즈) | LineChart |
| 시계열 추세 (다중 시리즈 비교) | LineChart (`showLegend`) |
| 시계열 면적 / 누적 비교 | AreaChart (`stacked` 옵션) |
| 인라인 미니 추세 (텍스트 중간) | SparkLine |
| 카테고리별 값 비교 (가로) | HorizontalBarChart |
| 카테고리별 값 비교 (세로 누적) | StackedBarChart |
| 카테고리별 min~max 밴드 | RangeBarChart |
| 비율·점유율 (전체 100%) | DonutChart |
| 두 수치 상관 (분포) | ScatterPlot |
| 2D 격자 (지역×기간 등) | HeatMap |
| 단일 비율·달성도 (속도계) | GaugeChart |
| 카테고리별 1차/2차 비교 (좌우) | DemographicShiftBars |
| 같은 그룹의 before/after (세로) | AgeGroupBars |

---

## 16. 관련 문서

- [chart-components-audit.md](./chart-components-audit.md) — 사이클 K 차트 한계 점검(다른 차트의 baseline·이상치 대응)
- 실제 컴포넌트 소스: `app/blog/components/<차트명>.tsx`
- 색상 시스템: `lib/chart-colors.ts`
- 디자인 토큰: `lib/chart-tokens.ts`

---

**문서 끝.** props 사양은 컴포넌트 코드가 변경되면 함께 갱신할 것. 차트 신규 도입 시 본 문서에 동일 형식으로 섹션 추가.
