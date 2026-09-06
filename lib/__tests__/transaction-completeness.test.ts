import { describe, expect, it } from 'vitest';
import { readTransactionCompleteness } from '../transaction-completeness';

describe('readTransactionCompleteness', () => {
  it('keeps existing complete responses compatible', () => {
    expect(readTransactionCompleteness({})).toEqual({ complete: true, failedMonths: [] });
    expect(readTransactionCompleteness({ status: 'ok', failedMonths: [] }).complete).toBe(true);
  });

  it('keeps partial status even when month details are absent', () => {
    expect(readTransactionCompleteness({ status: 'partial' })).toEqual({ complete: false, failedMonths: [] });
  });

  it('treats reported failures as incomplete even without partial status', () => {
    expect(readTransactionCompleteness({ status: 'ok', failedMonths: ['202608'] })).toEqual({
      complete: false, failedMonths: ['202608'],
    });
  });

  it('only displays valid unique months, newest first', () => {
    expect(readTransactionCompleteness({ failedMonths: ['202607', '202608', '202607', '202613', '202600', 202606, '<script>'] })).toEqual({
      complete: false, failedMonths: ['202608', '202607'],
    });
    expect(readTransactionCompleteness({ failedMonths: ['bad'] }).complete).toBe(false);
  });
});
