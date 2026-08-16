import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ── In-memory rate limit store ──
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const WINDOW_MS = 60_000; // 1분
const MAX_REQUESTS = 60;  // 분당 60회
const VISITOR_MAX_REQUESTS = 6; // 동일 IP의 방문 집계는 분당 6회만 허용

// 오래된 항목 정리 (5분마다)
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [key, value] of rateLimitMap) {
    if (now > value.resetTime) rateLimitMap.delete(key);
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /api/* 경로에만 적용
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  cleanup();

  const ip = getClientIp(request);
  const now = Date.now();
  const isVisitorAnalytics = pathname === '/api/analytics/visit';
  const limit = isVisitorAnalytics ? VISITOR_MAX_REQUESTS : MAX_REQUESTS;
  const rateLimitKey = isVisitorAnalytics ? `visitor:${ip}` : `api:${ip}`;
  const entry = rateLimitMap.get(rateLimitKey);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(rateLimitKey, { count: 1, resetTime: now + WINDOW_MS });
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(limit));
    response.headers.set('X-RateLimit-Remaining', String(limit - 1));
    return response;
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);

  if (entry.count > limit) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(Math.ceil((entry.resetTime - now) / 1000)),
        },
      },
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
