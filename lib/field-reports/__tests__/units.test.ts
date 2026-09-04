import { describe, expect, it } from 'vitest';
import { eokToManwon, pyeongToSquareMeters, squareMetersToPyeong } from '../units';

describe('field report display unit conversion', () => {
  it('converts one-decimal 평 into at most two-decimal square metres', () => {
    expect(pyeongToSquareMeters('25.7')).toBe(84.96);
    expect(pyeongToSquareMeters('3.1')).toBe(10.25);
    expect(pyeongToSquareMeters('151.2')).toBe(499.83);
  });

  it('rejects excess precision, exponent notation, and converted values outside storage bounds', () => {
    expect(pyeongToSquareMeters('25.75')).toBeNull();
    expect(pyeongToSquareMeters('2.5e1')).toBeNull();
    expect(pyeongToSquareMeters('3')).toBeNull();
    expect(pyeongToSquareMeters('151.3')).toBeNull();
  });

  it('converts at most two decimal 억원 to exact integer 만원', () => {
    expect(eokToManwon('8.3', false)).toBe(83_000);
    expect(eokToManwon('8.03', false)).toBe(80_300);
    expect(eokToManwon('500', false)).toBe(5_000_000);
    expect(eokToManwon('0', true)).toBe(0);
  });

  it('rejects invalid price precision, range, and non-monthly zero', () => {
    expect(eokToManwon('8.301', false)).toBeNull();
    expect(eokToManwon('5e2', false)).toBeNull();
    expect(eokToManwon('500.01', false)).toBeNull();
    expect(eokToManwon('0', false)).toBeNull();
  });

  it('formats stored square metres as a one-decimal 평 value', () => {
    expect(squareMetersToPyeong(84.95)).toBe(25.7);
  });
});
