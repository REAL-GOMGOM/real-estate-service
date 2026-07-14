/**
 * collapseByKey 단위 테스트 — Phase 2 (자체 DB 적재).
 * 국토부가 원거래+해제를 별개 item 으로 주면 같은 dedupeKey 가 한 배치에
 * 둘 이상 생긴다. upsert 전에 이를 하나로(해제 상태 반영) 합쳐야 Postgres
 * "cannot affect row a second time" 를 피한다.
 */
import { describe, it, expect } from 'vitest';
import { collapseByKey } from '../tx-upsert';
import type { NewTransaction } from '../db/schema';

function row(over: Partial<NewTransaction> = {}): NewTransaction {
  return {
    dedupeKey: '11170|이촌동|412|이촌코오롱|59.82|10|2026-07-07|205000',
    lawdCd: '11170', sigungu: '용산구', umdNm: '이촌동', jibun: '412',
    aptName: '이촌코오롱(A)', aptNameNorm: '이촌코오롱', masterId: null,
    areaM2: 59.82, floor: 10, buildYear: 1999,
    dealDate: '2026-07-07', dealAmount: 205000, dealType: 'buy',
    dealingGbn: '중개거래', rgstDate: null,
    isCanceled: false, canceledDate: null, source: 'molit',
    ...over,
  };
}

describe('collapseByKey', () => {
  it('같은 키의 정상+해제를 1행으로 병합하고 해제 상태로 수렴', () => {
    const out = collapseByKey([
      row({ isCanceled: false, canceledDate: null }),
      row({ isCanceled: true, canceledDate: '26.07.10' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isCanceled).toBe(true);
    expect(out[0].canceledDate).toBe('26.07.10');
  });

  it('해제가 먼저 와도 동일하게 수렴 (순서 무관)', () => {
    const out = collapseByKey([
      row({ isCanceled: true, canceledDate: '26.07.10' }),
      row({ isCanceled: false, canceledDate: null }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].isCanceled).toBe(true);
    expect(out[0].canceledDate).toBe('26.07.10');
  });

  it('서로 다른 키는 보존', () => {
    const out = collapseByKey([
      row({ dedupeKey: 'A' }),
      row({ dedupeKey: 'B' }),
      row({ dedupeKey: 'A' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.dedupeKey).sort()).toEqual(['A', 'B']);
  });

  it('등기일·거래유형은 null 이 아닌 쪽을 보존', () => {
    const out = collapseByKey([
      row({ rgstDate: null, dealingGbn: null }),
      row({ rgstDate: '26.07.20', dealingGbn: '직거래' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].rgstDate).toBe('26.07.20');
    expect(out[0].dealingGbn).toBe('직거래');
  });

  it('빈 배열은 빈 배열', () => {
    expect(collapseByKey([])).toEqual([]);
  });
});
