import { describe, expect, it } from 'vitest';
import { getCalendarEvents } from '@/lib/calendar-events';

function eventsFor2026() {
  return Array.from({ length: 12 }, (_, index) => getCalendarEvents(2026, index + 1)).flat();
}

function datesForTitle(title: string) {
  return eventsFor2026()
    .filter((event) => event.title === title)
    .map((event) => event.event_date);
}

describe('2026 경제 달력 공식 일정', () => {
  it('한국은행과 FOMC 결정일을 검증된 날짜로 제공한다', () => {
    expect(datesForTitle('한국은행 기준금리 결정')).toEqual([
      '2026-01-15', '2026-02-26', '2026-04-10', '2026-05-28',
      '2026-07-16', '2026-08-27', '2026-10-22', '2026-11-26',
    ]);
    expect(datesForTitle('FOMC 회의 결과 발표')).toEqual([
      '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
      '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
    ]);
  });

  it('CPI·NFP·GDP 공식 발표일을 빠짐없이 제공하고 추정 문구를 만들지 않는다', () => {
    expect(datesForTitle('미국 CPI (소비자물가지수)')).toEqual([
      '2026-01-13', '2026-02-13', '2026-03-11', '2026-04-10',
      '2026-05-12', '2026-06-10', '2026-07-14', '2026-08-12',
      '2026-09-11', '2026-10-14', '2026-11-10', '2026-12-10',
    ]);
    expect(datesForTitle('미국 비농업 고용 (NFP)')).toEqual([
      '2026-01-09', '2026-02-11', '2026-03-06', '2026-04-03',
      '2026-05-08', '2026-06-05', '2026-07-02', '2026-08-07',
      '2026-09-04', '2026-10-02', '2026-11-06', '2026-12-04',
    ]);
    expect(datesForTitle('미국 GDP')).toEqual([
      '2026-02-20', '2026-03-13', '2026-04-09', '2026-04-30',
      '2026-05-28', '2026-06-25', '2026-07-30', '2026-08-26',
      '2026-09-30', '2026-10-29', '2026-11-25', '2026-12-23',
    ]);
    expect(eventsFor2026().some((event) => event.description?.includes('추정'))).toBe(false);
  });

  it('한국부동산원 반복 일정은 확정 일정처럼 표현하지 않는다', () => {
    const recurring = getCalendarEvents(2026, 8).filter((event) => event.category === 'index');

    expect(recurring.length).toBeGreaterThan(0);
    expect(recurring.every((event) => event.title.includes('통상 일정'))).toBe(true);
    expect(recurring.every((event) => event.description?.includes('변경될 수 있는 미확정 일정'))).toBe(true);
  });
});
