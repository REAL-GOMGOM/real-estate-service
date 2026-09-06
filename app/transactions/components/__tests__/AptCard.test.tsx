import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { detectNewHigh, type AptGroup, type Transaction } from '../../types';
import AptCard from '../AptCard';

function transaction(values: Partial<Transaction>): Transaction {
  return {
    aptName: '잠실엘스', district: '송파구', area: 85, floor: 15,
    price: 341000, pricePerArea: 4012, date: '2026-08-01', ...values,
  };
}

function apartment(transactions: Transaction[]): AptGroup {
  return { id: 'A123', name: '잠실엘스', district: '송파구', areas: [60, 85], transactions };
}

function render(transactions: Transaction[], months = 2) {
  return renderToStaticMarkup(<AptCard apt={apartment(transactions)} months={months} onClick={() => {}} />);
}

describe('AptCard price comparison', () => {
  it('uses the headline 85㎡ cohort instead of the more frequent 60㎡ cohort for prior peak and chart', () => {
    const transactions = [
      transaction({ area: 60, price: 290000, date: '2026-07-01' }),
      transaction({ area: 60, price: 300500, date: '2026-07-02' }),
      transaction({ area: 60, price: 295000, date: '2026-07-03' }),
      transaction({ price: 335000, date: '2026-07-15' }),
      transaction({}),
    ];
    const markup = render(transactions);
    expect(markup).toContain('34억 1,000만');
    expect(markup).toContain('2개월 내 종전 최고 33억 5,000만');
    expect(markup).toContain('기간 최고가 경신');
    expect(markup).not.toContain('30.1억');
    expect(markup).toContain('85㎡ 기준 유사 면적(±6㎡) 가격 추이 (2개월 내 거래 2건)');
    expect(detectNewHigh(apartment(transactions))).toBe(true);
  });

  it('does not announce a new high or draw a comparison chart for a single transaction', () => {
    const markup = render([transaction({})]);
    expect(markup).toContain('비교 거래 부족');
    expect(markup).not.toContain('경신');
    expect(markup).not.toContain('기간 신고가');
    expect(markup).not.toContain('가격 추이');
  });

  it('labels an equal prior peak as equal rather than a new high', () => {
    const transactions = [transaction({}), transaction({ date: '2026-07-01' })];
    const markup = render(transactions);
    expect(markup).toContain('기간 최고가와 같음');
    expect(markup).not.toContain('경신');
    expect(detectNewHigh(apartment(transactions))).toBe(false);
  });

  it('shows the exact gap below the earlier peak instead of marking an old high as the latest high', () => {
    const transactions = [
      transaction({ price: 330000, date: '2026-06-01' }),
      transaction({ price: 345000, date: '2026-07-01' }),
      transaction({}),
    ];
    const markup = render(transactions);
    expect(markup).toContain('2개월 내 최고 34억 5,000만');
    expect(markup).toContain('기간 최고가까지 4,000만 남음');
    expect(markup).not.toContain('경신');
    expect(detectNewHigh(apartment(transactions))).toBe(false);
  });

  it('does not invent order between same-date contracts', () => {
    const markup = render([transaction({}), transaction({ price: 330000 })]);
    expect(markup).toContain('비교 거래 부족');
    expect(markup).not.toContain('경신');
    expect(markup).not.toContain('가격 추이');
  });

  it.each([2, 6, 12, 36])('labels the requested %s-month window instead of a fixed recent 3 months', (months) => {
    const markup = render([transaction({}), transaction({ date: '2026-07-01' })], months);
    expect(markup).toContain(`조회 ${months}개월`);
    expect(markup).toContain('>2건</strong>');
    expect(markup).not.toContain('최근 3개월');
  });

  it('ignores malformed records and safely renders no card when no valid comparison target exists', () => {
    expect(render([])).toBe('');
    expect(render([transaction({ price: NaN }), transaction({ area: 0 })])).toBe('');
    const markup = render([
      transaction({}), transaction({ price: Infinity, date: '2026-08-02' }),
      transaction({ area: NaN }), transaction({ date: '2026-02-31' }),
    ]);
    expect(markup).toContain('34억 1,000만');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });
});
