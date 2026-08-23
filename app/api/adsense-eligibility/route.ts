import { NextRequest, NextResponse } from 'next/server';

function allowedCountries(): Set<string> {
  const configured = process.env.ADSENSE_ALLOWED_COUNTRIES || 'KR';
  return new Set(
    configured.split(',').map((country) => country.trim().toUpperCase()).filter(Boolean),
  );
}

/**
 * Google 인증 CMP가 없는 동안 AdSense는 명시적으로 허용한 국가에서만 로드한다.
 * Vercel은 배포 요청에 x-vercel-ip-country를 제공한다. 국가 미상 production
 * 요청은 보수적으로 차단하고, 로컬 개발만 시각 검증을 위해 허용한다.
 */
export async function GET(request: NextRequest) {
  const country = request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || null;
  const eligible = country
    ? allowedCountries().has(country)
    : process.env.NODE_ENV !== 'production';

  return NextResponse.json(
    { eligible, country },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        Vary: 'x-vercel-ip-country',
      },
    },
  );
}
