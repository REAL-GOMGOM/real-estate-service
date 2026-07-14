/**
 * 실거래 자연 복합키 — Phase 2 (자체 DB 적재).
 *
 * 국토부 실거래는 안정적 거래 ID를 제공하지 않는다. 따라서 물리적 거래
 * 1건을 식별하는 복합키를 결정적으로 만든다. 같은 거래의 재조회·해제
 * 통보는 반드시 같은 키를 만들어 upsert 로 기존 행을 갱신해야 한다
 * (신규 행 생성 X). 그래서 취소 여부(cdealType)는 키 입력에서 제외한다 —
 * 해제된 거래는 원거래와 동일 키로 돌아와 isCanceled 만 갱신되어야 하므로.
 *
 * 트레이드오프: 동일 (지역·법정동·지번·단지·면적·층·계약일·금액) 인 진짜
 * 별개 거래 2건은 1건으로 병합된다. 물리적으로 극히 드물고(같은 호는 하루
 * 두 번 거래 불가) 업계 표준(아실·호갱노노) 처리와 동일하다.
 */

const SEP = '|';

export interface DedupeKeyFields {
  lawdCd: string;
  umdNm: string;
  jibun: string | null;
  aptNameNorm: string;
  areaM2: number;
  floor: number | null;
  dealDate: string;   // YYYY-MM-DD
  dealAmount: number; // 만원
}

/** 자연 복합키를 정규화·파이프조인한 결정적 키 (transactions.dedupeKey PK) */
export function buildDedupeKey(f: DedupeKeyFields): string {
  return [
    f.lawdCd.trim(),
    f.umdNm.trim(),
    (f.jibun ?? '').trim(),
    f.aptNameNorm.trim(),
    f.areaM2.toFixed(2),          // 소수 2자리 고정 — 84.97 ≈ 84.9700001 부동소수 오차 병합 방지
    f.floor == null ? '' : String(f.floor),
    f.dealDate.trim(),
    String(f.dealAmount),
  ].join(SEP);
}
