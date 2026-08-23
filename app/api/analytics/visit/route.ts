import { NextRequest, NextResponse } from 'next/server';
import { getVisitorClientIp, recordVisitor } from '@/lib/visitor-analytics';

const RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isAdminPage(request: NextRequest): boolean {
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    const url = new URL(referer);
    return url.origin === new URL(request.url).origin
      && (url.pathname === '/admin' || url.pathname.startsWith('/admin/'));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { status: 'forbidden' },
      { status: 403, headers: RESPONSE_HEADERS },
    );
  }

  const consentGranted = request.headers.get('x-naezip-analytics-consent') === 'granted';
  if (!consentGranted || isAdminPage(request)) {
    return NextResponse.json(
      { status: 'ignored' },
      { status: 202, headers: RESPONSE_HEADERS },
    );
  }

  const status = await recordVisitor({
    ip: getVisitorClientIp(request.headers),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json(
    { status },
    { status: 202, headers: RESPONSE_HEADERS },
  );
}
