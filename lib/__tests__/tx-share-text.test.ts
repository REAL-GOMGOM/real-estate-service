/**
 * tx-share-text 단위 테스트 — 공유 강화.
 * 평당가 정확성(㎡당 오표기 버그 재발 방지)과 기간 캡션 필수 표기를 잠근다.
 */
import { describe, it, expect } from 'vitest';
import {
  fmtMonthsLabel, pricePerPyeong, buildPeakLine, buildTxShareText, txKey,
} from '../tx-share-text';
import { fmtPrice } from '../tx-shared';

describe('fmtMonthsLabel', () => {
  it('12의 배수는 년 단위', () => {
    expect(fmtMonthsLabel(12)).toBe('1년');
    expect(fmtMonthsLabel(36)).toBe('3년');
  });
  it('그 외는 개월', () => {
    expect(fmtMonthsLabel(6)).toBe('6개월');
  });
});

describe('pricePerPyeong', () => {
  it('진짜 평당가 — ㎡당(pricePerArea)과 3.3배 차이 (실사례 15.5억/134㎡)', () => {
    const perPy = pricePerPyeong(155000, 134);
    expect(perPy).toBeGreaterThan(3700); // ≈3,824만/평
    expect(perPy).toBeLessThan(3900);
    // ㎡당 값(≈1,157)과 확실히 구분되는지
    expect(perPy).toBeGreaterThan(Math.round(155000 / 134) * 3);
  });
  it('0·음수 방어', () => {
    expect(pricePerPyeong(0, 84)).toBe(0);
    expect(pricePerPyeong(100000, 0)).toBe(0);
  });
});

describe('buildPeakLine — 기간 캡션 필수', () => {
  const fmt = fmtPrice;
  it('경신: 기간 + 종전 + 경신폭', () => {
    const line = buildPeakLine({ price: 155000, peak: 155000, prevPeak: 149000, months: 36, fmt });
    expect(line).toBe('3년 내 최고가 · 종전 14.9억 +6,000만');
  });
  it('미달: 기간 + 최고가 + 차이', () => {
    const line = buildPeakLine({ price: 149000, peak: 155000, prevPeak: null, months: 6, fmt });
    expect(line).toBe('6개월 내 최고 15.5억 대비 -6,000만');
  });
  it('종전 비교 불가 시 최고가만', () => {
    expect(buildPeakLine({ price: 155000, peak: 155000, prevPeak: null, months: 36, fmt }))
      .toBe('3년 내 최고가');
  });
  it('데이터 없으면 빈 문자열', () => {
    expect(buildPeakLine({ price: 0, peak: 0, prevPeak: null, months: 36, fmt })).toBe('');
  });
});

describe('buildTxShareText', () => {
  it('가격·계약 정보·비교·위치·딥링크를 읽기 쉬운 여러 줄로 만든다', () => {
    const s = buildTxShareText({
      aptName: '성동마을엘지빌리지2차', location: '용인시 수지구 성복동',
      url: 'https://www.naezipkorea.com/transactions?aptId=A41465108&tx=2026-07-08_134_9_155000',
      price: 155000, areaM2: 134, floor: 9, date: '2026-07-08',
      peakLine: '3년 내 최고가 · 종전 14.9억 +6,000만',
      fmt: fmtPrice, fmtDate: (d) => d.slice(2).replace(/-/g, '.'),
    });
    expect(s).toBe([
      '🏠 성동마을엘지빌리지2차 실거래',
      '💰 15.5억 · 평당 3,824만',
      '📐 134㎡ (41평) · 9층',
      '📅 26.07.08 계약',
      '🔥 3년 내 최고가 · 종전 14.9억보다 6,000만 높음',
      '📍 용인시 수지구 성복동',
      '',
      '🔎 거래 자세히 보기',
      'https://www.naezipkorea.com/transactions?aptId=A41465108&tx=2026-07-08_134_9_155000',
      '— 내집 My.ZIP',
    ].join('\n'));
  });

  it('최고가 미달 비교에서 음수 기호 대신 낮은 금액을 설명한다', () => {
    const s = buildTxShareText({
      aptName: '까치마을', location: '강남구 수서동',
      url: 'https://www.naezipkorea.com/transactions?aptId=A123',
      price: 154500, areaM2: 34, floor: 14, date: '2026-07-28',
      peakLine: '2개월 내 최고 16.6억 대비 -1.1억',
      fmt: fmtPrice, fmtDate: (d) => d.slice(2).replace(/-/g, '.'),
    });
    expect(s).toContain('📊 2개월 내 최고 16.6억보다 1.1억 낮음');
    expect(s).not.toContain('대비 -');
  });
});

describe('txKey', () => {
  it('결정적 식별자 (계약일_면적_층_가격)', () => {
    expect(txKey({ date: '2026-07-08', area: 134, floor: 9, price: 155000 }))
      .toBe('2026-07-08_134_9_155000');
  });
});
