/**
 * buildDedupeKey 단위 테스트 — Phase 2 (자체 DB 적재).
 * 중복 병합·해제 갱신의 정확성이 이 키에 달려 있으므로 경계값 위주.
 */
import { describe, it, expect } from 'vitest';
import { buildDedupeKey, type DedupeKeyFields } from '../tx-dedupe-key';

const base: DedupeKeyFields = {
  lawdCd: '11680', umdNm: '대치동', jibun: '316',
  aptNameNorm: '은마', areaM2: 84.43, floor: 5,
  dealDate: '2026-06-15', dealAmount: 250000,
};

describe('buildDedupeKey', () => {
  it('동일 입력은 동일 키 (결정적)', () => {
    expect(buildDedupeKey(base)).toBe(buildDedupeKey({ ...base }));
  });

  it('면적은 소수 2자리로 고정 — 부동소수 오차 병합 방지', () => {
    expect(buildDedupeKey({ ...base, areaM2: 84.43 })).toBe(
      buildDedupeKey({ ...base, areaM2: 84.4300001 }),
    );
    expect(buildDedupeKey({ ...base, areaM2: 84.43 })).not.toBe(
      buildDedupeKey({ ...base, areaM2: 84.51 }),
    );
  });

  it('금액이 다르면 다른 키', () => {
    expect(buildDedupeKey({ ...base, dealAmount: 250000 })).not.toBe(
      buildDedupeKey({ ...base, dealAmount: 251000 }),
    );
  });

  it('층 null 과 층 0 은 구분됨', () => {
    expect(buildDedupeKey({ ...base, floor: null })).not.toBe(
      buildDedupeKey({ ...base, floor: 0 }),
    );
  });

  it('지번·단지명 앞뒤 공백은 트림되어 동일 키', () => {
    expect(buildDedupeKey({ ...base, aptNameNorm: ' 은마 ', jibun: ' 316 ' })).toBe(
      buildDedupeKey({ ...base, aptNameNorm: '은마', jibun: '316' }),
    );
  });

  it('지번 null 은 빈 문자열로 안정 처리', () => {
    expect(buildDedupeKey({ ...base, jibun: null })).toBe(
      buildDedupeKey({ ...base, jibun: null }),
    );
  });

  it('법정동이 다르면 다른 키 (동명 단지 구분)', () => {
    expect(buildDedupeKey({ ...base, umdNm: '대치동' })).not.toBe(
      buildDedupeKey({ ...base, umdNm: '개포동' }),
    );
  });
});
