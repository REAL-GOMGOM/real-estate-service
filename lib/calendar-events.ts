/**
 * 경제 달력 수동 검증 이벤트
 *
 * 한국은행·미국 일정은 아래 공식 발표 달력을 기준으로 검증한다.
 * 한국부동산원 주간·월간 일정은 정확한 공표일이 아니라 통상 발표일이며,
 * 행사명과 설명에서 변경 가능성을 명시한다.
 */

export interface CalendarEvent {
  id: number;
  event_date: string;
  category: string;
  title: string;
  description: string | null;
  source_url: string | null;
  icon: string;
  importance: string;
}

export interface CalendarSource {
  name: string;
  url: string;
}

export const CALENDAR_VERIFIED_AT = '2026-08-09';

export const CALENDAR_NOTE =
  '한국은행·미국 경제지표 일정은 각 기관의 2026년 공식 발표 일정을 확인했습니다. 한국부동산원 주간·월간 일정은 통상 발표일로, 공휴일이나 기관 사정에 따라 변경될 수 있습니다. 방문 전 출처에서 최신 일정을 다시 확인하세요.';

export const CALENDAR_SOURCES: CalendarSource[] = [
  { name: '한국은행 금융통화위원회', url: 'https://www.bok.or.kr' },
  { name: '미 연방준비제도 FOMC', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
  { name: '미 노동통계국 CPI', url: 'https://www.bls.gov/schedule/news_release/cpi.htm' },
  { name: '미 노동통계국 고용보고서', url: 'https://www.bls.gov/schedule/news_release/empsit.htm' },
  { name: '미 경제분석국 GDP', url: 'https://www.bea.gov/news/schedule' },
  { name: '한국부동산원', url: 'https://www.reb.or.kr' },
];

// 2026년 한국은행 금통위 일정 (공식)
// https://www.bok.or.kr → 통화정책 → 금통위 회의일정
const BOK_2026 = [
  { date: '2026-01-15', desc: '2026년 1차 금통위' },
  { date: '2026-02-26', desc: '2026년 2차 금통위' },
  { date: '2026-04-10', desc: '2026년 3차 금통위' },
  { date: '2026-05-28', desc: '2026년 4차 금통위' },
  { date: '2026-07-16', desc: '2026년 5차 금통위' },
  { date: '2026-08-27', desc: '2026년 6차 금통위' },
  { date: '2026-10-22', desc: '2026년 7차 금통위' },
  { date: '2026-11-26', desc: '2026년 8차 금통위' },
];

// 2026년 FOMC 일정 (공식)
// https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
const FOMC_2026 = [
  { date: '2026-01-28', desc: 'FOMC 1월 회의 결과' },
  { date: '2026-03-18', desc: 'FOMC 3월 회의 결과 (점도표)' },
  { date: '2026-04-29', desc: 'FOMC 4월 회의 결과' },
  { date: '2026-06-17', desc: 'FOMC 6월 회의 결과 (점도표)' },
  { date: '2026-07-29', desc: 'FOMC 7월 회의 결과' },
  { date: '2026-09-16', desc: 'FOMC 9월 회의 결과 (점도표)' },
  { date: '2026-10-28', desc: 'FOMC 10월 회의 결과' },
  { date: '2026-12-09', desc: 'FOMC 12월 회의 결과 (점도표)' },
];

// 2026년 미국 CPI 발표일 (BLS 공식)
// 출처: https://www.bls.gov/schedule/news_release/cpi.htm
const US_CPI_2026 = [
  { date: '2026-01-13', desc: '12월 CPI 발표' },
  { date: '2026-02-13', desc: '1월 CPI 발표' },
  { date: '2026-03-11', desc: '2월 CPI 발표' },
  { date: '2026-04-10', desc: '3월 CPI 발표' },
  { date: '2026-05-12', desc: '4월 CPI 발표' },
  { date: '2026-06-10', desc: '5월 CPI 발표' },
  { date: '2026-07-14', desc: '6월 CPI 발표' },
  { date: '2026-08-12', desc: '7월 CPI 발표' },
  { date: '2026-09-11', desc: '8월 CPI 발표' },
  { date: '2026-10-14', desc: '9월 CPI 발표' },
  { date: '2026-11-10', desc: '10월 CPI 발표' },
  { date: '2026-12-10', desc: '11월 CPI 발표' },
];

// 2026년 미국 고용보고서 (NFP) 공식 발표 일정 (08:30 ET)
// 출처: https://www.bls.gov/schedule/news_release/empsit.htm
const US_NFP_2026 = [
  { date: '2026-01-09', desc: '12월 비농업 고용 보고서' },
  { date: '2026-02-11', desc: '1월 비농업 고용 보고서' },
  { date: '2026-03-06', desc: '2월 비농업 고용 보고서' },
  { date: '2026-04-03', desc: '3월 비농업 고용 보고서' },
  { date: '2026-05-08', desc: '4월 비농업 고용 보고서' },
  { date: '2026-06-05', desc: '5월 비농업 고용 보고서' },
  { date: '2026-07-02', desc: '6월 비농업 고용 보고서' },
  { date: '2026-08-07', desc: '7월 비농업 고용 보고서' },
  { date: '2026-09-04', desc: '8월 비농업 고용 보고서' },
  { date: '2026-10-02', desc: '9월 비농업 고용 보고서' },
  { date: '2026-11-06', desc: '10월 비농업 고용 보고서' },
  { date: '2026-12-04', desc: '11월 비농업 고용 보고서' },
];

// 2026년 미국 GDP 발표일 (BEA 공식 발표 일정)
// 출처: https://www.bea.gov/news/schedule
const US_GDP_2026 = [
  { date: '2026-02-20', desc: 'GDP Q4 속보치 (Advance)' },
  { date: '2026-03-13', desc: 'GDP Q4 잠정치 (Second)' },
  { date: '2026-04-09', desc: 'GDP Q4 확정치 (Third)' },
  { date: '2026-04-30', desc: 'GDP Q1 속보치 (Advance)' },
  { date: '2026-05-28', desc: 'GDP Q1 잠정치 (Second)' },
  { date: '2026-06-25', desc: 'GDP Q1 확정치 (Third)' },
  { date: '2026-07-30', desc: 'GDP Q2 속보치 (Advance)' },
  { date: '2026-08-26', desc: 'GDP Q2 잠정치 (Second)' },
  { date: '2026-09-30', desc: 'GDP Q2 확정치 (Third)' },
  { date: '2026-10-29', desc: 'GDP Q3 속보치 (Advance)' },
  { date: '2026-11-25', desc: 'GDP Q3 잠정치 (Second)' },
  { date: '2026-12-23', desc: 'GDP Q3 확정치 (Third)' },
];

// 주간 아파트 동향 (매주 목요일, 한국부동산원)
function getWeeklyThursdays(year: number, month: number): string[] {
  const dates: string[] = [];
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCMonth() === month - 1) {
    if (d.getUTCDay() === 4) { // 목요일
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

export function getCalendarEvents(year: number, month: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  let id = 1;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;

  // 한국은행 금통위
  for (const bok of BOK_2026) {
    if (bok.date.startsWith(prefix)) {
      events.push({
        id: id++,
        event_date: bok.date,
        category: 'rate',
        title: '한국은행 기준금리 결정',
        description: bok.desc,
        source_url: 'https://www.bok.or.kr',
        icon: '🏦',
        importance: 'high',
      });
    }
  }

  // FOMC
  for (const fomc of FOMC_2026) {
    if (fomc.date.startsWith(prefix)) {
      events.push({
        id: id++,
        event_date: fomc.date,
        category: 'us_economic',
        title: 'FOMC 회의 결과 발표',
        description: fomc.desc,
        source_url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
        icon: '🇺🇸',
        importance: 'high',
      });
    }
  }

  // 주간 아파트 동향의 통상 발표일 (확정 일정 아님)
  for (const thu of getWeeklyThursdays(year, month)) {
    events.push({
      id: id++,
      event_date: thu,
      category: 'index',
      title: '주간 아파트 가격 동향 (통상 일정)',
      description: '통상 목요일 발표 · 공휴일 및 기관 사정에 따라 변경될 수 있는 미확정 일정',
      source_url: 'https://www.reb.or.kr',
      icon: '📊',
      importance: 'normal',
    });
  }

  // 월간 지수의 통상 발표일 (확정 일정 아님)
  const condoDate = `${prefix}-15`;
  events.push({
    id: id++,
    event_date: condoDate,
    category: 'index',
    title: '월간 아파트 가격지수 공시 (통상 일정)',
    description: '통상 매월 15일경 발표 · 공휴일 및 기관 사정에 따라 변경될 수 있는 미확정 일정',
    source_url: 'https://www.reb.or.kr',
    icon: '📊',
    importance: 'normal',
  });

  // 미국 CPI
  for (const cpi of US_CPI_2026) {
    if (cpi.date.startsWith(prefix)) {
      events.push({
        id: id++,
        event_date: cpi.date,
        category: 'us_economic',
        title: '미국 CPI (소비자물가지수)',
        description: cpi.desc + ' · 08:30 ET',
        source_url: 'https://www.bls.gov/cpi/',
        icon: '🇺🇸',
        importance: 'high',
      });
    }
  }

  // 미국 고용보고서 (NFP)
  for (const nfp of US_NFP_2026) {
    if (nfp.date.startsWith(prefix)) {
      events.push({
        id: id++,
        event_date: nfp.date,
        category: 'us_economic',
        title: '미국 비농업 고용 (NFP)',
        description: nfp.desc + ' · 08:30 ET',
        source_url: 'https://www.bls.gov/ces/',
        icon: '🇺🇸',
        importance: 'high',
      });
    }
  }

  // 미국 GDP
  for (const gdp of US_GDP_2026) {
    if (gdp.date.startsWith(prefix)) {
      events.push({
        id: id++,
        event_date: gdp.date,
        category: 'us_economic',
        title: '미국 GDP',
        description: gdp.desc + ' · 08:30 ET',
        source_url: 'https://www.bea.gov/news/schedule',
        icon: '🇺🇸',
        importance: gdp.desc.includes('속보치') ? 'high' : 'normal',
      });
    }
  }

  return events.sort((a, b) => a.event_date.localeCompare(b.event_date));
}
