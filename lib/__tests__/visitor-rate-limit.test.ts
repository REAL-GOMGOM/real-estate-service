import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('visitor analytics rate limit', () => {
  it('동일 IP의 방문 집계 요청을 분당 6회로 제한한다', async () => {
    const ip = '203.0.113.199';
    const request = () => new NextRequest('https://www.naezipkorea.com/api/analytics/visit', {
      headers: { 'x-forwarded-for': ip },
    });
    expect(request().nextUrl.pathname).toBe('/api/analytics/visit');

    for (let index = 0; index < 6; index += 1) {
      const response = await proxy(request());
      expect(response.status).toBe(200);
      expect(response.headers.get('x-ratelimit-limit')).toBe('6');
    }

    const limited = await proxy(request());
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});
