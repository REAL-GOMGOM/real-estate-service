import { NextRequest, NextResponse } from 'next/server';
import type { SchoolInfo } from '@/types/school-map';

/**
 * GET /api/schools?region=서울&type=middle
 *
 * 현재는 서울 주요 학군 더미 데이터 반환.
 * 향후 학교알리미 API(공공데이터포트) 연동 예정.
 */

const DUMMY_SCHOOLS: SchoolInfo[] = [
  // 강남구
  { id: 's1',  name: '대치초등학교',     type: 'elementary', address: '서울 강남구 대치동', lat: 37.4944, lng: 127.0632, studentCount: 1200, district: '강남구' },
  { id: 's2',  name: '대청중학교',       type: 'middle',     address: '서울 강남구 대치동', lat: 37.4930, lng: 127.0580, studentCount: 850,  district: '강남구' },
  { id: 's3',  name: '단대부속중학교',   type: 'middle',     address: '서울 강남구 대치동', lat: 37.4960, lng: 127.0620, studentCount: 780,  district: '강남구' },
  { id: 's4',  name: '휘문고등학교',     type: 'high',       address: '서울 강남구 대치동', lat: 37.4950, lng: 127.0650, studentCount: 950,  district: '강남구' },
  { id: 's5',  name: '숙명여자고등학교', type: 'high',       address: '서울 강남구 도곡동', lat: 37.4880, lng: 127.0450, studentCount: 720,  district: '강남구' },
  // 서초구
  { id: 's6',  name: '서초초등학교',     type: 'elementary', address: '서울 서초구 서초동', lat: 37.4850, lng: 127.0150, studentCount: 980,  district: '서초구' },
  { id: 's7',  name: '서운중학교',       type: 'middle',     address: '서울 서초구 서초동', lat: 37.4870, lng: 127.0200, studentCount: 640,  district: '서초구' },
  { id: 's8',  name: '세화고등학교',     type: 'high',       address: '서울 서초구 반포동', lat: 37.5010, lng: 127.0070, studentCount: 880,  district: '서초구' },
  // 송파구
  { id: 's9',  name: '잠실초등학교',     type: 'elementary', address: '서울 송파구 잠실동', lat: 37.5080, lng: 127.0870, studentCount: 1100, district: '송파구' },
  { id: 's10', name: '잠실중학교',       type: 'middle',     address: '서울 송파구 잠실동', lat: 37.5060, lng: 127.0830, studentCount: 720,  district: '송파구' },
  { id: 's11', name: '보인고등학교',     type: 'high',       address: '서울 송파구 송파동', lat: 37.5030, lng: 127.1050, studentCount: 810,  district: '송파구' },
  // 양천구 (목동)
  { id: 's12', name: '목동초등학교',     type: 'elementary', address: '서울 양천구 목동',   lat: 37.5270, lng: 126.8720, studentCount: 900,  district: '양천구' },
  { id: 's13', name: '목운중학교',       type: 'middle',     address: '서울 양천구 목동',   lat: 37.5290, lng: 126.8680, studentCount: 680,  district: '양천구' },
  { id: 's14', name: '영훈고등학교',     type: 'high',       address: '서울 양천구 목동',   lat: 37.5250, lng: 126.8750, studentCount: 750,  district: '양천구' },
  // 노원구 (중계동)
  { id: 's15', name: '중계초등학교',     type: 'elementary', address: '서울 노원구 중계동', lat: 37.6400, lng: 127.0720, studentCount: 850,  district: '노원구' },
  { id: 's16', name: '중계중학교',       type: 'middle',     address: '서울 노원구 중계동', lat: 37.6380, lng: 127.0680, studentCount: 620,  district: '노원구' },
  { id: 's17', name: '대진고등학교',     type: 'high',       address: '서울 노원구 중계동', lat: 37.6420, lng: 127.0700, studentCount: 700,  district: '노원구' },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const region = searchParams.get('region');
    const type = searchParams.get('type');

    let filtered = DUMMY_SCHOOLS;

    if (region) {
      filtered = filtered.filter((s) => s.district?.includes(region) || s.address.includes(region));
    }
    if (type && ['elementary', 'middle', 'high'].includes(type)) {
      filtered = filtered.filter((s) => s.type === type);
    }

    return NextResponse.json({ schools: filtered }, {
      headers: { 'Cache-Control': 's-maxage=86400' },
    });
  } catch (error: unknown) {
    console.error('[schools API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '학교 데이터를 불러올 수 없습니다' }, { status: 500 });
  }
}
