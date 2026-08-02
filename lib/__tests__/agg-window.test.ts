import { describe, it, expect } from 'vitest';
import { kstTodayIso, shiftDays, resolveAggWindow, kstCurrentYyyymm } from '../agg-window';

/** KST 자정 경계가 낀 시각 — UTC 8/1 20:00 = KST 8/2 05:00 */
const UTC_EVENING = new Date('2026-08-01T20:00:00Z');
/** 평범한 낮 — UTC 8/2 03:00 = KST 8/2 12:00 */
const KST_NOON = new Date('2026-08-02T03:00:00Z');

describe('kstTodayIso', () => {
  it('UTC 저녁은 KST 다음 날이다 (크론 새벽 5시 = UTC 전날 20시 케이스)', () => {
    expect(kstTodayIso(UTC_EVENING)).toBe('2026-08-02');
  });
  it('KST 낮은 그대로', () => {
    expect(kstTodayIso(KST_NOON)).toBe('2026-08-02');
  });
});

describe('shiftDays', () => {
  it('월 경계', () => {
    expect(shiftDays('2026-08-01', -1)).toBe('2026-07-31');
  });
  it('연 경계', () => {
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('+1일 (배타 상한 계산)', () => {
    expect(shiftDays('2026-08-31', 1)).toBe('2026-09-01');
  });
});

describe('resolveAggWindow', () => {
  it('기본(미지정)은 최근 30일 — 오늘 포함, 상한 배타', () => {
    const w = resolveAggWindow(null, KST_NOON)!;
    expect(w.type).toBe('rolling30');
    expect(w.from).toBe('2026-07-04');   // 8/2 - 29일
    expect(w.to).toBe('2026-08-03');     // 8/2 + 1일 (배타)
  });

  it("'rolling30' 명시도 동일", () => {
    expect(resolveAggWindow('rolling30', KST_NOON)).toEqual(resolveAggWindow(null, KST_NOON));
  });

  it('월 지정 — 전월', () => {
    const w = resolveAggWindow('202607', KST_NOON)!;
    expect(w).toMatchObject({ type: 'month', yyyymm: '202607', from: '2026-07-01', to: '2026-08-01' });
  });

  it('월 지정 — 12월은 익년 1월초가 상한', () => {
    const w = resolveAggWindow('202512', KST_NOON)!;
    expect(w.to).toBe('2026-01-01');
  });

  it('당월은 허용', () => {
    expect(resolveAggWindow('202608', KST_NOON)?.type).toBe('month');
  });

  it('미래 월은 거부', () => {
    expect(resolveAggWindow('202609', KST_NOON)).toBeNull();
  });

  it('KST 로 이미 다음 달인 UTC 말일 저녁 — 새 달이 "당월"로 허용되어야 한다', () => {
    // UTC 7/31 20:00 = KST 8/1 05:00 → 202608 은 미래가 아니라 당월
    const w = resolveAggWindow('202608', new Date('2026-07-31T20:00:00Z'));
    expect(w?.type).toBe('month');
  });

  it('형식 오류는 거부', () => {
    expect(resolveAggWindow('abc', KST_NOON)).toBeNull();
    expect(resolveAggWindow('20268', KST_NOON)).toBeNull();
    expect(resolveAggWindow('202613', KST_NOON)).toBeNull();
    expect(resolveAggWindow('190001', KST_NOON)).toBeNull();
  });
});

describe('kstCurrentYyyymm', () => {
  it('KST 월 경계 반영', () => {
    expect(kstCurrentYyyymm(new Date('2026-07-31T20:00:00Z'))).toBe('202608');
    expect(kstCurrentYyyymm(KST_NOON)).toBe('202608');
  });
});
