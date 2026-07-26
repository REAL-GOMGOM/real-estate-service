import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 학교 지도 API — 정적 JSON 전환 (2026-07).
 *
 * 기존 구조의 이중 결함을 제거했다:
 *   1) 로컬 SQLite 경로 — data/*.db 는 gitignore 라 프로덕션에 배포된 적이 없음 (항상 실패)
 *   2) NEIS 라이브 + Kakao 지오코딩 폴백 — 느리고(외부 2단 호출) 최대 50개 제한, 등급 정보 전무
 *
 * 개편: 학교알리미 공시 기반 빌드 산출물(data/schools-map.json, 전국 11,973개교)을
 * 서버 기동 시 1회 로드 — 외부 호출 0회, 응답 수 ms.
 * 갱신 주기 연 1회: sync-schoolinfo.ts → build-school-map.ts → 커밋.
 *
 * grade·진학률 필드는 KESS/경기 진로 데이터 합류 시 채운다 (현재 null — 프론트 호환 유지).
 * 화면 출처 표기: 학교알리미(초·중등 교육정보 공시서비스)
 */

interface MapSchool {
  id: string;
  name: string;
  school_level: 'elementary' | 'middle' | 'high';
  address: string;
  latitude: number;
  longitude: number;
  establish_type: string | null;
  coedu_type: string | null;
  student_count: number | null;
  district: string;
  sido: string;
  class_count: number | null;
  per_class: number | null;
  move_in: number | null;
  move_out: number | null;
  hs_type: string | null;
}

const LEVELS = new Set(['elementary', 'middle', 'high']);
const DEFAULT_LIMIT = 800;
const MAX_LIMIT = 3000;

/** 진학률 데이터 합류 전 프론트(SchoolData) 호환 자리표시 */
const RATE_PLACEHOLDER = {
  teacher_count: null as number | null,
  grade: null as string | null,
  nationwide_pct: null as number | null,
  region_pct: null as number | null,
  special_high_rate: null as number | null,
  science_high_rate: null as number | null,
  foreign_high_rate: null as number | null,
  autonomous_high_rate: null as number | null,
};

// 모듈 스코프 1회 로드 — 콜드스타트에서만 파싱 비용 발생 (~4.6MB)
let allSchools: MapSchool[] | null = null;
function loadSchools(): MapSchool[] {
  if (allSchools) return allSchools;
  const filePath = path.join(process.cwd(), 'data', 'schools-map.json');
  const doc = JSON.parse(readFileSync(filePath, 'utf8')) as { schools: MapSchool[] };
  allSchools = doc.schools;
  return allSchools;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const district = (searchParams.get('district') ?? '').trim();
    // 시도 필터 — '중구'처럼 전국 중복 시군구명 구분용 (리스트 페이지에서 함께 전달)
    const sido = (searchParams.get('sido') ?? '').trim();
    const level = searchParams.get('level') ?? '';
    const limitParam = parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    let list = loadSchools();
    if (LEVELS.has(level)) {
      list = list.filter((s) => s.school_level === level);
    }
    if (sido) {
      list = list.filter((s) => s.sido.includes(sido));
    }
    if (district) {
      // '서울'(시도)·'강남구'(시군구)·주소 부분 문자열 모두 허용 — 기존 호출부 호환
      list = list.filter(
        (s) => s.sido.includes(district) || s.district.includes(district) || s.address.includes(district),
      );
    }

    const schools = list.slice(0, limit).map((s) => ({ ...s, ...RATE_PLACEHOLDER }));
    return NextResponse.json(
      { schools, total: list.length, source: '학교알리미(초·중등 교육정보 공시서비스)' },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    );
  } catch (error: unknown) {
    console.error('[map/schools API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '학교 데이터를 불러올 수 없습니다', schools: [] }, { status: 500 });
  }
}
