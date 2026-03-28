import { NextRequest, NextResponse } from 'next/server';
import { getSchoolsByDistrict, getSchoolsInBounds, seedSchoolData } from '@/lib/map-db';

/**
 * GET /api/map/schools?district=강남구&level=middle
 * GET /api/map/schools?swLat=37.49&swLng=127.01&neLat=37.52&neLng=127.08
 */
export async function GET(request: NextRequest) {
  try {
    seedSchoolData();

    const { searchParams } = request.nextUrl;
    const district = searchParams.get('district');
    const level = searchParams.get('level') || undefined;
    const swLat = searchParams.get('swLat');
    const swLng = searchParams.get('swLng');
    const neLat = searchParams.get('neLat');
    const neLng = searchParams.get('neLng');

    let schools;
    if (swLat && swLng && neLat && neLng) {
      schools = getSchoolsInBounds(
        Number(swLat), Number(swLng), Number(neLat), Number(neLng), level,
      );
    } else if (district) {
      schools = getSchoolsByDistrict(district, level);
    } else {
      schools = getSchoolsByDistrict('강남구', level);
    }

    return NextResponse.json({ schools });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
