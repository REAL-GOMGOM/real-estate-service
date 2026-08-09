import { NextResponse } from 'next/server';

/**
 * 이전 학교 API는 검증되지 않은 소수 샘플 좌표를 반환했다.
 * 실제 학교알리미 공시 데이터 API로 통합했으며, 조용히 다른 응답 형식으로
 * 바꾸지 않고 410으로 종료해 기존 소비자가 가짜 데이터를 계속 쓰지 않게 한다.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'retired',
      error: '이 API는 종료되었습니다. /api/map/schools를 사용해 주세요.',
      replacement: '/api/map/schools',
    },
    {
      status: 410,
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    },
  );
}
