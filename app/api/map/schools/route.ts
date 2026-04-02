import { NextRequest, NextResponse } from 'next/server';

const NEIS_URL = 'https://open.neis.go.kr/hub/schoolInfo';
const LEVEL_MAP: Record<string, string> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
};
const ATPT_CODES: Record<string, string> = {
  '서울': 'B10', '인천': 'E10', '경기': 'J10',
};

// ── SQLite 시도 ─────────────────────────────────────
function tryDbSchools(district?: string, level?: string) {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(process.cwd(), 'data', 'realestate.db'), { readonly: true });
    let sql = `
      SELECT s.*, r.grade, r.special_high_rate, r.science_high_rate,
             r.foreign_high_rate, r.autonomous_high_rate, r.nationwide_pct, r.region_pct
      FROM schools s
      LEFT JOIN school_rankings r ON s.id = r.school_id
      WHERE s.latitude IS NOT NULL
    `;
    const params: string[] = [];
    if (district) { sql += ' AND s.district LIKE ?'; params.push(`%${district}%`); }
    if (level) { sql += ' AND s.school_level = ?'; params.push(level); }
    sql += ' ORDER BY r.grade ASC NULLS LAST LIMIT 200';
    const rows = db.prepare(sql).all(...params);
    db.close();
    return rows;
  } catch {
    return null;
  }
}

// ── Kakao 키워드 검색으로 학교 좌표 조회 ────────────
async function geocodeSchool(
  schoolName: string,
  kakaoKey: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    // 학교 카테고리(SC4)로 키워드 검색 — 정확도 높음
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(schoolName)}&category_group_code=SC4&size=1`,
      { headers: { Authorization: `KakaoAK ${kakaoKey}` } },
    );
    const json = await res.json();
    const doc = json.documents?.[0];
    if (doc) {
      return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
    }
    return null;
  } catch {
    return null;
  }
}

// ── NEIS API + Kakao geocoding ──────────────────────
async function fetchNeisSchools(
  apiKey: string,
  kakaoKey: string,
  district?: string,
  level?: string,
) {
  const atptCode = district
    ? Object.entries(ATPT_CODES).find(([k]) => district.includes(k))?.[1] || 'B10'
    : 'B10';

  const params = new URLSearchParams({
    KEY: apiKey,
    Type: 'json',
    ATPT_OFCDC_SC_CODE: atptCode,
    pSize: '100',
    pIndex: '1',
  });

  if (level && LEVEL_MAP[level]) {
    params.set('SCHUL_KND_SC_NM', LEVEL_MAP[level]);
  }

  const res = await fetch(`${NEIS_URL}?${params}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 86400 },
  });
  const data = await res.json();
  const rows = data?.schoolInfo?.[1]?.row || [];

  const raw: any[] = [];
  for (const r of rows) {
    const addr = `${r.ORG_RDNMA || ''} ${r.ORG_RDNDA || ''}`.trim();
    if (district && !addr.includes(district)) continue;

    const kind = r.SCHUL_KND_SC_NM;
    const schoolLevel = kind === '초등학교' ? 'elementary' : kind === '중학교' ? 'middle' : kind === '고등학교' ? 'high' : null;
    if (!schoolLevel) continue;

    raw.push({
      id: `${r.ATPT_OFCDC_SC_CODE}-${r.SD_SCHUL_CODE}`,
      name: r.SCHUL_NM,
      school_level: schoolLevel,
      address: addr,
      latitude: null,
      longitude: null,
      establish_type: r.FOND_SC_NM,
      coedu_type: r.COEDU_SC_NM,
      student_count: null,
      teacher_count: null,
      district: district || null,
      grade: null,
      nationwide_pct: null,
      region_pct: null,
      special_high_rate: null,
      science_high_rate: null,
      foreign_high_rate: null,
      autonomous_high_rate: null,
    });
  }

  // Kakao geocoding (최대 50개, 10개씩 배치)
  const limited = raw.slice(0, 50);
  for (let i = 0; i < limited.length; i += 10) {
    const batch = limited.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (school) => {
        const coord = await geocodeSchool(school.name, kakaoKey);
        if (coord) {
          school.latitude = coord.lat;
          school.longitude = coord.lng;
        }
        return school;
      }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && !r.value.latitude) {
        // geocoding 실패 — 해당 학교는 좌표 없음
      }
    }
  }

  // 좌표 있는 학교만 반환
  return limited.filter((s) => s.latitude && s.longitude);
}

// ── GET ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const district = searchParams.get('district') || undefined;
    const level = searchParams.get('level') || undefined;

    // 1) SQLite 시도
    const dbSchools = tryDbSchools(district, level);
    if (dbSchools && dbSchools.length > 0) {
      return NextResponse.json({ schools: dbSchools }, {
        headers: { 'Cache-Control': 's-maxage=86400' },
      });
    }

    // 2) NEIS + Kakao geocoding fallback
    const apiKey = process.env.NEIS_API_KEY;
    const kakaoKey = process.env.KAKAO_REST_API_KEY;
    if (!apiKey || !kakaoKey) {
      return NextResponse.json({ schools: [] });
    }

    const schools = await fetchNeisSchools(apiKey, kakaoKey, district, level);
    return NextResponse.json({ schools }, {
      headers: { 'Cache-Control': 's-maxage=86400' },
    });
  } catch (error: unknown) {
    console.error('[map/schools API]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: '학교 데이터를 불러올 수 없습니다', schools: [] }, { status: 500 });
  }
}
