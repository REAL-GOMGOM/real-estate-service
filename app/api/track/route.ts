import { NextRequest, NextResponse } from 'next/server';
import { trackVisit } from '@/lib/visitor-tracking';

/**
 * 방문자 트래킹 엔드포인트
 * 실패해도 200 반환 — 페이지 로드에 영향 주지 않음
 */
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';
    const ua = req.headers.get('user-agent') ?? '';
    await trackVisit(ip, ua);
  } catch (err) {
    console.error('[api/track] failed:', err);
  }
  return NextResponse.json({ ok: true });
}
