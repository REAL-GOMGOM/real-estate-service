import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const databaseConstructor = vi.hoisted(() => vi.fn());

vi.mock('better-sqlite3', () => ({ default: databaseConstructor }));

import { GET } from '../route';

describe('GET /api/calendar', () => {
  it('더미 SQLite를 읽지 않고 검증된 2026년 8월 일정과 출처만 반환한다', async () => {
    const response = await GET(new NextRequest(
      'https://www.naezipkorea.com/api/calendar?year=2026&month=8',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      year: 2026,
      month: 8,
      verifiedAt: '2026-08-09',
    });
    expect(body.sources.length).toBeGreaterThanOrEqual(6);
    expect(body.note).toContain('변경될 수 있습니다');
    expect(body.events).toHaveLength(9);
    expect(body.events.filter((event: { title: string }) => event.title === '한국은행 기준금리 결정'))
      .toEqual([expect.objectContaining({ event_date: '2026-08-27' })]);
    expect(body.events.filter((event: { title: string }) => event.title === '미국 GDP'))
      .toEqual([expect.objectContaining({ event_date: '2026-08-26' })]);
    expect(body.events.some((event: { description: string | null }) => event.description?.includes('추정')))
      .toBe(false);
    expect(databaseConstructor).not.toHaveBeenCalled();
  });

  it.each([
    '?year=twenty&month=8',
    '?year=1999&month=8',
    '?year=2101&month=8',
    '?year=2026.5&month=8',
    '?year=2026&month=0',
    '?year=2026&month=13',
    '?year=2026&month=august',
  ])('잘못된 연월 %s 요청을 400으로 거절한다', async (query) => {
    const response = await GET(new NextRequest(`https://www.naezipkorea.com/api/calendar${query}`));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ status: 'error' });
  });
});
