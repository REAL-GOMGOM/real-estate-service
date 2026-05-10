# Phase 2.2.a Skipped 216건 진단 보고서

> 작성일: 2026-05-09
> 사이클: I
> 작성자: Claude Code (Eric 검토 대기)
> HEAD 시작 시점: bd26060 (사이클 H Phase 2.4 완료)

---

## Executive Summary

1. **216건 전부 세종특별자치시 단지 누락**. K-apt 응답에서 `as2` (시군구) 컬럼이 빈 문자열로 내려오고, 적재 스크립트의 `!item.as2` 가드에 일괄 차단됨.
2. **세종 외 시도는 누락 0건**. 정규화·인코딩·중복 PK·필수 필드 다른 영역 모두 깨끗.
3. 인기 단지 spot check 30건에서 **K-apt 등록·DB 누락 (critical)** 케이스는 0건. 사용자 검색 적중률에 미치는 영향은 낮음. 단, 세종 사용자에 대해서는 0% 적중.

**권장 다음 액션 (P0)**: 적재 스크립트 가드 완화 hotfix — 세종처럼 `as2`가 비는 광역단위 행정구역에서는 `as1`만 검증하고 `as2`는 빈 문자열 허용. 별도 사이클로 분리해 Eric 승인 후 진행.

---

## 1. 환경

- DB: Neon Postgres (Singapore aws-ap-southeast-1)
- apartments 테이블 카운트: **21,931건** (분석 시점, 변화 0)
- 적재 스크립트: [scripts/seed-apartments.ts](../scripts/seed-apartments.ts)
- K-apt API: `https://apis.data.go.kr/1613000/AptListService3/getTotalAptList3`
- 분석 시점: 2026-05-09
- 진단 스크립트: 모두 읽기 전용 (INSERT/UPDATE 0)

---

## 2. 원인 분류 결과

| 카테고리 | 건수 | 비율 |
|---|---:|---:|
| `required_field_null` (sigungu 빈 문자열) | 216 | 100.0% |
| `lawd_cd_invalid` | 0 | 0.0% |
| `normalization_failed` | 0 | 0.0% |
| `encoding_issue` | 0 | 0.0% |
| `duplicate_kapt_code` | 0 | 0.0% |
| `other` | 0 | 0.0% |

전 건수가 단일 카테고리 — 단순한 구조적 누락.

### 대표 샘플 (3건)

| kaptCode | name | sido | sigungu | bjdCode |
|---|---|---|---|---|
| A10023365 | 수루배마을9단지 | 세종특별자치시 | (빈 문자열) | 3611010100 |
| A10024397 | 세종 펠리스 | 세종특별자치시 | (빈 문자열) | 3611010100 |
| A10025230 | 수루배마을4단지 | 세종특별자치시 | (빈 문자열) | 3611010100 |

bjdCode 첫 5자리는 `36110` (DISTRICT_CODE의 `'세종시': '36110'` 매핑 존재). lawd_cd 변환은 정상이고, `as2` 누락만이 적재 차단의 직접 원인.

---

## 3. 분포 분석

### 3.1 시도별 분포 (적재 vs skipped)

| 시도 | 적재 (21,931) | skipped (216) | loadedShare | skippedShare | deviation |
|---|---:|---:|---:|---:|---:|
| 세종특별자치시 | 0 | 216 | 0.000 | 1.000 | ∞ |
| 그 외 16개 시도 | 21,931 | 0 | 1.000 | 0.000 | 0 |

deviation threshold 2.0 초과 항목은 **세종 1건뿐**. 다른 모든 시도(서울·경기·인천·부산·대구·광주·대전·울산·강원·충북·충남·전북·전남·경북·경남·제주)는 누락 0.

### 3.2 시군구별

skipped 216건 모두 `세종특별자치시 / (빈 문자열)` 단일 그룹. 시군구별 편향 추가 분석 의미 없음.

### 3.3 데이터 산출물

원본 분류·분포 raw: [data/skipped-analysis.json](../data/skipped-analysis.json)
원본 K-apt 응답 + DB diff: [data/skipped-list.json](../data/skipped-list.json)

---

## 4. 핵심 단지 Spot Check (30건)

| status | 건수 | 의미 |
|---|---:|---|
| `ok` | 15 | DB에 정확히 1건 매칭 |
| `multi_match` | 3 | DB에 여러 건 매칭 (자동완성 정상) |
| `missing_in_db_present_in_kapt` | **0** | critical — 없음 |
| `missing_in_kapt` | 12 | K-apt 등록 자체가 없음 — alias 보강 필요 |

### 4.1 ok (15건) — 정확 매칭

잠실엘스 / 헬리오시티 / 아크로리버파크 / 래미안퍼스티지 / 서초아크로비스타 / 래미안첼리투스 / 래미안원베일리 / 래미안블레스티지 / 서초그랑자이 / 대치우성1차아파트 / 도곡렉슬 / 동분당파크뷰 / 판교푸르지오월드마크 / 해운대두산위브더제니스 / 대구수성아이파크.

### 4.2 multi_match (3건) — 자동완성에서 사용자 선택 가능

- `압구정현대` → 압구정현대8차, 압구정현대아파트
- `반포자이` → 신반포자이아파트, 반포자이
- `송도더샵퍼스트파크` → 13/14/15단지

UX 관점에서 정상 동작. 자동완성 드롭다운에서 사용자가 단지 선택.

### 4.3 missing_in_kapt (12건) — K-apt 미등록

| 단지 | 추정 사유 |
|---|---|
| 은마아파트 | 의무관리대상 외(노후 재건축 추진) — K-apt 미등록 가능성 |
| 잠실주공5단지 | 동일 |
| 디에이치자이개포 | 신축 — K-apt 등록 시점 차이 가능 |
| 개포주공1단지 | 재건축 진행 중 — 명칭 변경 |
| 목동신시가지7단지 | 동일 |
| 광교중앙푸르지오 | 신도시 별칭 — K-apt 등록명 다를 가능성 |
| 동탄2신도시반도유보라 | 동일 |
| 위례신도시 | 신도시 광역명 — 단지 단위 등록명 다름 |
| 부천중동위브더스테이트 | 표기 변형 |
| 광주봉선롯데캐슬 | 등록명 차이 (예: '롯데캐슬봉선' 등) |
| 대전둔산크로바 | 등록명 차이 |
| 부산용호더블유 | 표기 변형 |

→ **Phase 2.2.c 네이버 검색 alias 보강의 1차 타겟**으로 활용 가능.

### 4.4 critical 케이스

`missing_in_db_present_in_kapt` 0건. 즉 K-apt에는 등록됐는데 DB 적재가 빠진 인기 단지는 **spot check 30건 한정으로는 없음**. 216건 skip의 영향은 세종 사용자에게 한정됨.

세종 단지 중 현재 입주가 활발한 단지 일부 (예: 수루배마을 1~9단지, 세종 펠리스) 는 검색 시도 시 0건 반환. 세종권 사용자에 대해 즉시 가시적인 버그.

원본 spot check: [data/spot-check-results.json](../data/spot-check-results.json)

---

## 5. 영향도 평가

| 영향 영역 | 영향도 | 근거 |
|---|---|---|
| 전국 검색 적중률 | 미미 (~1%) | 22,147 중 216 = 0.98% 누락. 인기 단지 0건. |
| 세종권 검색 적중률 | **0%** | 세종 단지 전부 누락. lawd_cd 36110은 매핑 가능하지만 단지 row 자체가 없어 검색 결과 X. |
| 거래 데이터 조회 | 영향 없음 | `/api/transactions?district=세종시` 는 DISTRICT_CODE 매핑으로 동작. 단, 단지명 자동완성은 0건. |
| 자동완성 UX | 부분 손상 | 세종 사용자 입장에선 자동완성이 안 됨. 다른 시도 사용자는 정상. |

prod 검증 (사이클 H):
```
curl https://www.naezipkorea.com/api/apartments/search?q=세종
→ results: []  (216건 누락 영향 추정 — 별도 검증 필요)
```

---

## 6. 권장 다음 액션 (3개 옵션)

### Option A — Hotfix (세종 적재 패치, 짧은 사이클)

- 적재 스크립트 가드 수정: `!item.as2` 대신 `!item.as1`만 hard-fail, `as2`는 빈 문자열 허용.
- 세종처럼 광역단위 행정구역의 sigungu 빈 문자열을 정상 row로 적재.
- DB sigungu 컬럼 NOT NULL 그대로 유지하려면 `sigungu = item.as2 || ''` 또는 sentinel `'세종'` 등 합의 필요.
- 적재 후 22,147 도달 검증.
- **소요**: ~1시간. 순수 hotfix 사이클.

### Option B — 종합 보강 (Phase 2.2.b/2.2.c와 묶어 진행)

- A의 hotfix를 2.2.b (메타데이터 보강) 또는 2.2.c (alias 보강) 사이클에 포함.
- 단점: hotfix 우선순위가 묻힐 수 있음.
- 장점: 적재 스크립트를 한 번에 정리.

### Option C — 보류 (세종 사용자 적음 가정 시)

- 세종 사용자 비중이 낮다고 판단되면 백로그로 미루고 Phase 2.2.b 알맹이 진행.
- 단, 세종 검색 0% 적중은 알려진 결함으로 명시적 기록.

### 추천: **Option A**

근거:
- 1시간짜리 작은 hotfix가 22,147건 100% 적재로 완성도를 끌어올림.
- 적재 스크립트 자체의 가드 결함이라 다른 사이클에 묶을 이점 없음.
- 세종은 행정중심복합도시 특성상 신축 입주 활발 — 사용자 신뢰도 직접 영향.
- Phase 2.2.b/2.2.c는 별도 가치 있는 작업이라 분리해 진행해야 함.

---

## 7. 발견된 이슈 (별도 사이클 후보)

1. **적재 스크립트 가드 결함** (Option A로 해결 권장)
   - [scripts/seed-apartments.ts:124](../scripts/seed-apartments.ts#L124) `!item.as2` 조건이 세종을 무조건 차단.
   - 동일 패턴: 향후 광역단위 자치단체(가령 서울이 자치구 없는 단위로 응답하는 경우 등)에 동일 결함 가능.
2. **K-apt 미등록 인기 단지 12건**
   - Phase 2.2.c (네이버 검색 alias 보강) 1차 타겟.
   - 별칭 보강만으로 해결 안 되는 단지(은마, 잠실주공5단지 등)는 수기 등록 검토.

---

## 8. 부록

### 8.1 파일 목록

- [docs/diagnosis-2.2.a-skipped.md](./diagnosis-2.2.a-skipped.md) — 본 보고서
- [data/skipped-list.json](../data/skipped-list.json) — K-apt 재호출 + DB diff (raw)
- [data/skipped-analysis.json](../data/skipped-analysis.json) — 분류·분포 분석
- [data/spot-check-results.json](../data/spot-check-results.json) — 인기 단지 30건
- [scripts/refetch-kapt-list.ts](../scripts/refetch-kapt-list.ts)
- [scripts/diagnose-skipped-apartments.ts](../scripts/diagnose-skipped-apartments.ts)
- [scripts/spot-check-popular-apartments.ts](../scripts/spot-check-popular-apartments.ts)

### 8.2 적재 스크립트 결함 위치

[scripts/seed-apartments.ts:124](../scripts/seed-apartments.ts#L124)

```typescript
if (!item.kaptCode || !item.kaptName || !lawdCd || !item.as1 || !item.as2) {
  skipped++;
  return null;
}
```

`!item.as2` 가 세종 216건의 차단 직접 원인.

### 8.3 검증 메모

- DB COUNT 변화: 0 (분석 전 21,931 → 분석 후 21,931). 진단 사이클 read-only 원칙 준수.
- 분류 합계: 216 (입력 216와 일치).
- spot check 30건 모두 결과 있음.
- prod 코드 변경 0 (`app/`, `components/`, `lib/`).

---

이상.
