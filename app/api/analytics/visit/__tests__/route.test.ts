import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getVisitorClientIp, recordVisitor } = vi.hoisted(() => ({
  getVisitorClientIp: vi.fn(() => '203.0.113.7'),
  recordVisitor: vi.fn(),
}));

vi.mock('@/lib/visitor-analytics', () => ({ getVisitorClientIp, recordVisitor }));

import { POST } from '../route';

function request(headers: Record<string, string>) {
  return new NextRequest('https://www.naezipkorea.com/api/analytics/visit', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/analytics/visit', () => {
  beforeEach(() => {
    getVisitorClientIp.mockClear();
    recordVisitor.mockReset().mockResolvedValue('recorded');
  });

  it('동일 출처이면서 분석 동의 신호가 있는 요청만 기록한다', async () => {
    const response = await POST(request({
      origin: 'https://www.naezipkorea.com',
      referer: 'https://www.naezipkorea.com/transactions',
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-for': '203.0.113.7',
      'x-naezip-analytics-consent': 'granted',
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: 'recorded' });
    expect(recordVisitor).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('분석 동의가 없거나 관리자 페이지에서 온 요청은 무시한다', async () => {
    const noConsent = await POST(request({ origin: 'https://www.naezipkorea.com' }));
    const admin = await POST(request({
      origin: 'https://www.naezipkorea.com',
      referer: 'https://www.naezipkorea.com/admin/posts',
      'x-naezip-analytics-consent': 'granted',
    }));

    await expect(noConsent.json()).resolves.toEqual({ status: 'ignored' });
    await expect(admin.json()).resolves.toEqual({ status: 'ignored' });
    expect(recordVisitor).not.toHaveBeenCalled();
  });

  it('교차 출처 POST를 거부한다', async () => {
    const response = await POST(request({
      origin: 'https://evil.example',
      'x-naezip-analytics-consent': 'granted',
    }));

    expect(response.status).toBe(403);
    expect(recordVisitor).not.toHaveBeenCalled();
  });

  it('저장소 장애는 페이지 동작을 막지 않는 202 unavailable 응답으로 끝낸다', async () => {
    recordVisitor.mockResolvedValue('unavailable');
    const response = await POST(request({
      origin: 'https://www.naezipkorea.com',
      'x-naezip-analytics-consent': 'granted',
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: 'unavailable' });
  });
});
