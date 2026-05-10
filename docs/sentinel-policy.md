# Sigungu Sentinel 정책

> 최초 도입: 사이클 J (2026-05-10)
> 영향 영역: `apartments` 테이블 적재·검색

## 배경

한국 행정구역 중 일부 자치단체는 시군구 단계가 없는 광역단위 자치단체.
현재 해당하는 곳: **세종특별자치시 1건**.

K-apt 단지 목록 API (`AptListService3/getTotalAptList3`) 응답에서 `as2` (시군구) 필드가 빈 문자열로 들어옴. apartments 테이블의 `sigungu` 컬럼은 NOT NULL이므로 그대로 적재할 수 없음.

사이클 H 시점까지는 적재 스크립트가 `!item.as2` 가드로 일괄 차단해서 세종 216건이 누락됐음 (사이클 I 진단으로 발견).

## 정책

`sigungu` 컬럼은 NOT NULL 유지. 광역단위 자치단체에서는 sentinel 값 (sido 단축형)을 사용한다.

| sido | sigungu sentinel |
|---|---|
| `세종특별자치시` | `세종` |

매핑: [scripts/seed-apartments.ts](../scripts/seed-apartments.ts) `METROPOLITAN_SENTINEL` 상수.

## 영향 범위

### 검색·필터 화면
- 자동완성 응답 `sigungu` 필드: `'세종'` 표시 — 행정구역 표기 관행과 일치, 사용자 자연스럽게 인식.
- `findDistrictByLawdCd('36110')` → `'세종시'` (DISTRICT_CODE 키, sentinel과 별개) — 사이클 H 시점부터 매핑 존재. 변경 불필요.

### 적재 스크립트
- `as1` (sido)는 hard-fail 유지.
- `as2` (sigungu)는 빈 문자열 허용. `normalizeSigungu(sido, as2)` 헬퍼가 sentinel 적용. 매핑 없는 광역단위 자치단체는 skip.

### MLTM 실거래 API
- 영향 없음. 실거래는 lawd_cd 5자리만 사용. 세종은 `36110` 단일 코드로 정상 동작.

## 향후 확장

다른 광역단위 자치단체가 추가되면 `METROPOLITAN_SENTINEL` 매핑에 추가:

- 강원특별자치도 / 전북특별자치도 / 제주특별자치도 → 모두 시군구 존재. 적용 X.
- 향후 신규 특별자치시 추가 시 동일 패턴.

## 검증 방법

```bash
# 적재 후 검증
npx tsx scripts/verify-sejong-backfill.ts
```

검증 항목:
1. apartments 총 COUNT
2. `sido='세종특별자치시'` COUNT
3. `sigungu='세종'` COUNT
4. backup 테이블과 join하여 기존 행 무영향
5. 세종 핵심 단지 spot check

## 관련 문서

- [docs/diagnosis-2.2.a-skipped.md](./diagnosis-2.2.a-skipped.md) — 사이클 I 진단
- [scripts/seed-apartments.ts](../scripts/seed-apartments.ts) — 적재 로직
- [scripts/verify-sejong-backfill.ts](../scripts/verify-sejong-backfill.ts) — 검증
