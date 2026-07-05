import { describe, it, expect } from 'vitest';
import {
  parseRentXml, groupRentTransactions, isJeonse, fmtRentPrice,
  type RentTransaction,
} from '../rent-shared';
import { fmtPrice } from '../tx-shared';

/** 사이클 II — 전월세 파서 단위 테스트 */

function item(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
  return `<item>${body}</item>`;
}

const BASE = {
  aptNm: '래미안', excluUseAr: '84.97', floor: '12',
  dealYear: '2026', dealMonth: '6', dealDay: '15',
  umdNm: '대치동', buildYear: '2015',
};

describe('parseRentXml', () => {
  it('전세 — 보증금 콤마 파싱, 월세 0', () => {
    const xml = item({ ...BASE, deposit: '150,000', monthlyRent: '0' });
    const [tx] = parseRentXml(xml, '강남구');
    expect(tx.deposit).toBe(150000);
    expect(tx.monthlyRent).toBe(0);
    expect(isJeonse(tx)).toBe(true);
    expect(tx.area).toBe(85);
    expect(tx.date).toBe('2026-06-15');
  });

  it('월세 — 보증금/월세 분리', () => {
    const xml = item({ ...BASE, deposit: '10,000', monthlyRent: '120' });
    const [tx] = parseRentXml(xml, '강남구');
    expect(tx.deposit).toBe(10000);
    expect(tx.monthlyRent).toBe(120);
    expect(isJeonse(tx)).toBe(false);
  });

  it('갱신 계약 — 종전 보증금·월세 보존, 신규는 null', () => {
    const renewed = item({
      ...BASE, deposit: '160,000', monthlyRent: '0',
      contractType: '갱신', preDeposit: '150,000', preMonthlyRent: '0',
    });
    const fresh = item({ ...BASE, aptNm: '신규단지', deposit: '90,000', monthlyRent: '0', contractType: '신규' });
    const txs = parseRentXml(renewed + fresh, '강남구');
    expect(txs[0].contractType).toBe('갱신');
    expect(txs[0].prevDeposit).toBe(150000);
    expect(txs[0].prevMonthlyRent).toBeNull();  // 0 → null (전세 갱신)
    expect(txs[1].prevDeposit).toBeNull();
  });

  it('필수 필드 누락·보증금 0 행은 제외', () => {
    const noName    = item({ ...BASE, aptNm: '', deposit: '50,000', monthlyRent: '0' });
    const noDeposit = item({ ...BASE, deposit: '0', monthlyRent: '100' });
    const ok        = item({ ...BASE, deposit: '50,000', monthlyRent: '0' });
    expect(parseRentXml(noName + noDeposit + ok, '강남구')).toHaveLength(1);
  });
});

describe('groupRentTransactions', () => {
  it('단지별 그룹핑 — 면적 목록·건축년도 채움', () => {
    const xml =
      item({ ...BASE, deposit: '150,000', monthlyRent: '0' }) +
      item({ ...BASE, excluUseAr: '59.9', deposit: '100,000', monthlyRent: '0' }) +
      item({ ...BASE, aptNm: '개포자이', deposit: '80,000', monthlyRent: '0' });
    const groups = groupRentTransactions(parseRentXml(xml, '강남구'));
    expect(groups).toHaveLength(2);
    const raemian = groups.find((g) => g.name === '래미안')!;
    expect(raemian.transactions).toHaveLength(2);
    expect(raemian.areas.sort((a, b) => a - b)).toEqual([60, 85]);
    expect(raemian.buildYear).toBe(2015);
  });
});

describe('fmtRentPrice', () => {
  const tx = (deposit: number, monthlyRent: number) =>
    ({ deposit, monthlyRent }) as Pick<RentTransaction, 'deposit' | 'monthlyRent'>;

  it('전세는 보증금만, 월세는 보증금/월세', () => {
    expect(fmtRentPrice(tx(150000, 0), fmtPrice)).toBe('15억');
    expect(fmtRentPrice(tx(10000, 120), fmtPrice)).toBe('1억/120만');
  });
});
