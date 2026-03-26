import { NextRequest, NextResponse } from 'next/server';
import { fetchSubscriptionCalendarEvents } from '@/lib/calendar-subscription';
import economicEventsRaw from '@/data/economic-events.json';

export type EconomicEventCategory =
  | 'rate_bok'
  | 'rate_fomc'
  | 'policy'
  | 'tax'
  | 'movein'
  | 'holiday'
  | 'etc';

export interface EconomicEvent {
  id:          string;
  date:        string;
  title:       string;
  emoji?:      string;
  category:    EconomicEventCategory;
  description?: string;
}

const economicEvents = economicEventsRaw as EconomicEvent[];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const year  = parseInt(searchParams.get('year')  ?? '', 10);
  const month = parseInt(searchParams.get('month') ?? '', 10);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'year, month 파라미터가 필요합니다 (예: ?year=2026&month=3)' },
      { status: 400 },
    );
  }

  // 달력에는 이전달 말일 ~ 다음달 초를 보여줘야 하므로 ±1달 범위 포함
  const prevMonth = month === 1  ? 12 : month - 1;
  const nextMonth = month === 12 ?  1 : month + 1;
  const prevYear  = month === 1  ? year - 1 : year;
  const nextYear  = month === 12 ? year + 1 : year;

  function monthPrefix(y: number, m: number) {
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  const prefixes = [
    monthPrefix(prevYear,  prevMonth),
    monthPrefix(year,      month),
    monthPrefix(nextYear,  nextMonth),
  ];

  try {
    const subscriptionEvents = await fetchSubscriptionCalendarEvents();

    const filteredSubs  = subscriptionEvents.filter(e =>
      prefixes.some(p => e.date.startsWith(p)),
    );
    const filteredEcon  = economicEvents.filter(e =>
      prefixes.some(p => e.date.startsWith(p)),
    );

    return NextResponse.json({
      year,
      month,
      subscriptions: filteredSubs,
      economic:      filteredEcon,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류';
    console.error('[calendar API]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
