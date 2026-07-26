/**
 * 지도 배포용 학교 JSON 빌드 — school-disclosure.json → schools-map.json
 *
 * 실행: npx tsx scripts/build-school-map.ts
 * 입력: data/school-disclosure.json (sync-schoolinfo.ts 산출, 5.8MB)
 * 출력: data/schools-map.json (활성·좌표 보유 학교만, 프론트 호환 필드, ~2MB, 커밋 대상)
 *
 * 필드명은 기존 /api/map/schools 응답(SchoolData)과 호환 유지 —
 * grade·진학률 필드는 KESS/경기 진로 데이터 합류 시 채운다 (현재 null).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const IN_PATH = path.join('data', 'school-disclosure.json');
const OUT_PATH = path.join('data', 'schools-map.json');

interface DisclosureSchool {
  code: string; name: string; level: 'elementary' | 'middle' | 'high';
  sido: string; sgg: string; sggCode: string;
  lat: number | null; lng: number | null; address: string | null;
  establishType: string | null; hsType: string | null; coedu: string | null;
  closed: boolean; excluded: boolean;
  students: number | null; classes: number | null; perClass: number | null;
  intake: number | null; moveIn: number | null; moveOut: number | null; moveBase: number | null;
}

/**
 * 프론트(SchoolData) 호환 + 확장 필드 — 파일 용량 다이어트를 위해
 * 항상 null인 자리표시 필드(grade·진학률·teacher_count)는 파일에 넣지 않고
 * /api/map/schools 응답 시점에 채운다. 좌표는 소수 6자리(≈11cm)로 반올림.
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
  district: string;                 // 시군구 (예: 강남구)
  sido: string;                     // 시도 (필터 매칭용 — 예: 서울특별시)
  // ── 확장 (2026-07 학교알리미 공시) ──
  class_count: number | null;
  per_class: number | null;         // 학급당 학생수 (과밀 지표)
  move_in: number | null;           // 연간 전입 (수요 프록시)
  move_out: number | null;
  hs_type: string | null;           // 고교 유형 (특수목적/자율/특성화/일반)
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function main() {
  const raw = JSON.parse(readFileSync(IN_PATH, 'utf8')) as { generatedAt: string; schools: DisclosureSchool[] };

  const out: MapSchool[] = [];
  let skipped = 0;
  for (const s of raw.schools) {
    // 폐교·휴교·공시제외·좌표 결측 제외 — 지도 표시 불가/무의미
    if (s.closed || s.excluded || s.lat === null || s.lng === null) { skipped++; continue; }
    out.push({
      id: s.code,
      name: s.name,
      school_level: s.level,
      address: s.address ?? '',
      latitude: round6(s.lat),
      longitude: round6(s.lng),
      establish_type: s.establishType,
      coedu_type: s.coedu,
      student_count: s.students,
      district: s.sgg,
      sido: s.sido,
      class_count: s.classes,
      per_class: s.perClass,
      move_in: s.moveIn,
      move_out: s.moveOut,
      hs_type: s.hsType,
    });
  }

  const byLevel = out.reduce<Record<string, number>>((a, s) => { a[s.school_level] = (a[s.school_level] ?? 0) + 1; return a; }, {});
  writeFileSync(OUT_PATH, JSON.stringify({
    source: '학교알리미(초·중등 교육정보 공시서비스) · 2026 공시',
    builtAt: new Date().toISOString(),
    baseGeneratedAt: raw.generatedAt,
    count: out.length,
    schools: out,
  }));
  console.log(`[build] ${out.length}개교 (초 ${byLevel.elementary} / 중 ${byLevel.middle} / 고 ${byLevel.high}) · 제외 ${skipped} → ${OUT_PATH}`);
}

main();
