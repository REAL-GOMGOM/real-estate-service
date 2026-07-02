/**
 * asset-rates 특성테스트 (Y5) — 정적 시세 테이블 조회 동작 고정.
 */
import { describe, it, expect } from 'vitest';
import {
  getBtcKrw,
  getGoldKrwPerGram,
  TROY_OZ_TO_GRAM,
  GRAM_PER_DON,
} from '../asset-rates';

describe('단위 상수', () => {
  it('트로이온스·한돈 환산 상수 고정', () => {
    expect(TROY_OZ_TO_GRAM).toBe(31.1035);
    expect(GRAM_PER_DON).toBe(3.75);
  });
});

describe('getBtcKrw', () => {
  it('2010년 이전(비트코인 미형성) → null', () => {
    expect(getBtcKrw(2010)).toBeNull();
    expect(getBtcKrw(2000)).toBeNull();
  });

  it('경계 연도·대표 연도 값 고정', () => {
    expect(getBtcKrw(2011)).toBe(5_000);
    expect(getBtcKrw(2021)).toBe(54_000_000);
    expect(getBtcKrw(2024)).toBe(89_000_000);
    expect(getBtcKrw(2025)).toBe(130_000_000);
  });

  it('테이블 범위 밖 미래 연도 → null (실시간 시세로 보완하는 설계)', () => {
    expect(getBtcKrw(2026)).toBeNull();
  });
});

describe('getGoldKrwPerGram', () => {
  it('2006년 이전 → null', () => {
    expect(getGoldKrwPerGram(2005)).toBeNull();
  });

  it('경계 연도·대표 연도 값 고정', () => {
    expect(getGoldKrwPerGram(2006)).toBe(21_000);
    expect(getGoldKrwPerGram(2011)).toBe(67_000);
    expect(getGoldKrwPerGram(2025)).toBe(195_000);
  });

  it('테이블 범위 밖 → null', () => {
    expect(getGoldKrwPerGram(2026)).toBeNull();
  });
});
