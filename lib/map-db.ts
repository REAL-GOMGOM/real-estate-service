import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'realestate.db');

let _db: Database.Database | null = null;

export function getMapDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    initSchemas(_db);
  }
  return _db;
}

function initSchemas(db: Database.Database) {
  // 학교 기본정보
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      school_level TEXT NOT NULL CHECK(school_level IN ('elementary','middle','high')),
      address TEXT,
      latitude REAL,
      longitude REAL,
      establish_type TEXT,
      coedu_type TEXT,
      student_count INTEGER,
      teacher_count INTEGER,
      district TEXT,
      region TEXT,
      neis_code TEXT,
      atpt_code TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_schools_level ON schools(school_level);
    CREATE INDEX IF NOT EXISTS idx_schools_coords ON schools(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_schools_district ON schools(district);
  `);

  // 학교 성취도/등급
  db.exec(`
    CREATE TABLE IF NOT EXISTS school_rankings (
      school_id TEXT PRIMARY KEY,
      grade TEXT CHECK(grade IN ('1','2','3','4','5')),
      nationwide_pct REAL,
      region_pct REAL,
      special_high_rate REAL,
      science_high_rate REAL,
      foreign_high_rate REAL,
      autonomous_high_rate REAL,
      achievement_a_rate REAL,
      achievement_b_rate REAL,
      data_year INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (school_id) REFERENCES schools(id)
    );
  `);

  // 어린이집
  db.exec(`
    CREATE TABLE IF NOT EXISTS childcare_centers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      capacity INTEGER,
      center_type TEXT,
      phone TEXT,
      district TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_childcare_coords ON childcare_centers(latitude, longitude);
  `);

  // 유치원
  db.exec(`
    CREATE TABLE IF NOT EXISTS kindergartens (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      capacity INTEGER,
      establish_type TEXT,
      phone TEXT,
      district TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_kindergarten_coords ON kindergartens(latitude, longitude);
  `);

  // 도서관
  db.exec(`
    CREATE TABLE IF NOT EXISTS libraries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      book_count INTEGER,
      library_type TEXT,
      district TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_library_coords ON libraries(latitude, longitude);
  `);

  // 학원
  db.exec(`
    CREATE TABLE IF NOT EXISTS academies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      subject TEXT,
      capacity INTEGER,
      district TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_academy_coords ON academies(latitude, longitude);
  `);

  // 지하철역
  db.exec(`
    CREATE TABLE IF NOT EXISTS subway_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      line TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      is_planned INTEGER DEFAULT 0,
      status TEXT,
      expected_open TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_subway_coords ON subway_stations(latitude, longitude);
  `);

  // 재개발/재건축
  db.exec(`
    CREATE TABLE IF NOT EXISTS redevelopment_projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL,
      district TEXT,
      project_name TEXT NOT NULL,
      project_type TEXT NOT NULL CHECK(project_type IN ('redevelopment','reconstruction','remodeling','moa_town')),
      status TEXT,
      address TEXT,
      latitude REAL,
      longitude REAL,
      area_sqm REAL,
      total_units INTEGER,
      source TEXT,
      source_url TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(region, project_name)
    );
    CREATE INDEX IF NOT EXISTS idx_redev_coords ON redevelopment_projects(latitude, longitude);
    CREATE INDEX IF NOT EXISTS idx_redev_type ON redevelopment_projects(project_type);
  `);

  // 학군 경계 (GeoJSON 폴리곤)
  db.exec(`
    CREATE TABLE IF NOT EXISTS school_districts (
      district_id TEXT PRIMARY KEY,
      school_level TEXT NOT NULL,
      geometry_json TEXT NOT NULL,
      center_lat REAL,
      center_lng REAL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 택지개발
  db.exec(`
    CREATE TABLE IF NOT EXISTS land_development (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_name TEXT NOT NULL,
      location_address TEXT,
      latitude REAL,
      longitude REAL,
      area_sqm REAL,
      status TEXT,
      developer TEXT,
      expected_completion TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_name, location_address)
    );
  `);

  // 데이터 동기화 로그
  db.exec(`
    CREATE TABLE IF NOT EXISTS data_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      sync_type TEXT NOT NULL,
      record_count INTEGER,
      status TEXT DEFAULT 'success',
      error_message TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

/** 뷰포트 범위 내 학교 조회 */
export function getSchoolsInBounds(
  swLat: number, swLng: number, neLat: number, neLng: number,
  level?: string,
) {
  const db = getMapDb();
  let sql = `
    SELECT s.*, r.grade, r.special_high_rate, r.science_high_rate,
           r.foreign_high_rate, r.autonomous_high_rate, r.nationwide_pct, r.region_pct
    FROM schools s
    LEFT JOIN school_rankings r ON s.id = r.school_id
    WHERE s.latitude BETWEEN ? AND ?
      AND s.longitude BETWEEN ? AND ?
  `;
  const params: (string | number)[] = [swLat, neLat, swLng, neLng];
  if (level) {
    sql += ' AND s.school_level = ?';
    params.push(level);
  }
  sql += ' ORDER BY r.grade ASC NULLS LAST LIMIT 200';
  return db.prepare(sql).all(...params);
}

/** 지역별 학교 조회 */
export function getSchoolsByDistrict(district: string, level?: string) {
  const db = getMapDb();
  let sql = `
    SELECT s.*, r.grade, r.special_high_rate, r.science_high_rate,
           r.foreign_high_rate, r.autonomous_high_rate, r.nationwide_pct, r.region_pct
    FROM schools s
    LEFT JOIN school_rankings r ON s.id = r.school_id
    WHERE s.district LIKE ?
  `;
  const params: string[] = [`%${district}%`];
  if (level) {
    sql += ' AND s.school_level = ?';
    params.push(level);
  }
  sql += ' ORDER BY r.grade ASC NULLS LAST LIMIT 200';
  return db.prepare(sql).all(...params);
}

/** 더미 학교 데이터 시딩 */
export function seedSchoolData() {
  const db = getMapDb();
  const count = db.prepare('SELECT COUNT(*) as cnt FROM schools').get() as { cnt: number };
  if (count.cnt > 0) return;

  const insertSchool = db.prepare(`
    INSERT OR IGNORE INTO schools (id, name, school_level, address, latitude, longitude, establish_type, coedu_type, student_count, teacher_count, district, region)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertRanking = db.prepare(`
    INSERT OR IGNORE INTO school_rankings (school_id, grade, nationwide_pct, region_pct, special_high_rate, science_high_rate, foreign_high_rate, autonomous_high_rate, data_year)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    // 강남구 대치동 학군
    insertSchool.run('E-GN-01', '서울대치초등학교', 'elementary', '서울 강남구 대치동 1002', 37.4944, 127.0632, '공립', '남녀공학', 1200, 55, '강남구', '서울');
    insertRanking.run('E-GN-01', '1', 1.0, 7.0, null, null, null, null, 2025);

    insertSchool.run('E-GN-02', '서울도곡초등학교', 'elementary', '서울 강남구 도곡동 467', 37.4880, 127.0450, '공립', '남녀공학', 980, 45, '강남구', '서울');
    insertRanking.run('E-GN-02', '1', 2.0, 8.0, null, null, null, null, 2025);

    insertSchool.run('M-GN-01', '대청중학교', 'middle', '서울 강남구 대치동 994', 37.4930, 127.0580, '공립', '남녀공학', 850, 52, '강남구', '서울');
    insertRanking.run('M-GN-01', '1', 0.5, 3.0, 5.0, 2.0, 4.0, 29.0, 2025);

    insertSchool.run('M-GN-02', '단대부속중학교', 'middle', '서울 강남구 대치동 970', 37.4960, 127.0620, '사립', '남중', 780, 48, '강남구', '서울');
    insertRanking.run('M-GN-02', '1', 0.8, 4.0, 3.0, 1.0, 2.0, 25.0, 2025);

    insertSchool.run('H-GN-01', '휘문고등학교', 'high', '서울 강남구 대치동 1005', 37.4950, 127.0650, '사립', '남고', 950, 65, '강남구', '서울');
    insertRanking.run('H-GN-01', '1', 1.5, 5.0, null, null, null, null, 2025);

    insertSchool.run('H-GN-02', '숙명여자고등학교', 'high', '서울 강남구 도곡동 460', 37.4880, 127.0445, '사립', '여고', 720, 55, '강남구', '서울');
    insertRanking.run('H-GN-02', '2', 8.0, 15.0, null, null, null, null, 2025);

    // 서초구
    insertSchool.run('E-SC-01', '서울서초초등학교', 'elementary', '서울 서초구 서초동 1650', 37.4850, 127.0150, '공립', '남녀공학', 980, 42, '서초구', '서울');
    insertRanking.run('E-SC-01', '1', 1.5, 6.0, null, null, null, null, 2025);

    insertSchool.run('M-SC-01', '서운중학교', 'middle', '서울 서초구 서초동 1366', 37.4870, 127.0200, '공립', '남녀공학', 640, 38, '서초구', '서울');
    insertRanking.run('M-SC-01', '1', 1.0, 5.0, 2.0, 1.0, 3.0, 15.0, 2025);

    insertSchool.run('H-SC-01', '세화고등학교', 'high', '서울 서초구 반포동 60', 37.5010, 127.0070, '사립', '남고', 880, 60, '서초구', '서울');
    insertRanking.run('H-SC-01', '1', 2.0, 7.0, null, null, null, null, 2025);

    // 송파구
    insertSchool.run('E-SP-01', '서울잠실초등학교', 'elementary', '서울 송파구 잠실동 195', 37.5080, 127.0870, '공립', '남녀공학', 1100, 50, '송파구', '서울');
    insertRanking.run('E-SP-01', '1', 3.0, 10.0, null, null, null, null, 2025);

    insertSchool.run('M-SP-01', '잠실중학교', 'middle', '서울 송파구 잠실동 177', 37.5060, 127.0830, '공립', '남녀공학', 720, 42, '송파구', '서울');
    insertRanking.run('M-SP-01', '1', 2.0, 8.0, 3.0, 0.0, 2.0, 18.0, 2025);

    insertSchool.run('H-SP-01', '보인고등학교', 'high', '서울 송파구 송파동 23', 37.5030, 127.1050, '사립', '남고', 810, 55, '송파구', '서울');
    insertRanking.run('H-SP-01', '2', 10.0, 18.0, null, null, null, null, 2025);

    // 양천구 목동
    insertSchool.run('E-YC-01', '서울목동초등학교', 'elementary', '서울 양천구 목동 920', 37.5270, 126.8720, '공립', '남녀공학', 900, 40, '양천구', '서울');
    insertRanking.run('E-YC-01', '1', 4.0, 12.0, null, null, null, null, 2025);

    insertSchool.run('M-YC-01', '목운중학교', 'middle', '서울 양천구 목동 903', 37.5290, 126.8680, '공립', '남녀공학', 680, 40, '양천구', '서울');
    insertRanking.run('M-YC-01', '1', 3.0, 10.0, 4.0, 1.0, 3.0, 20.0, 2025);

    // 노원구 중계동
    insertSchool.run('E-NW-01', '서울중계초등학교', 'elementary', '서울 노원구 중계동 352', 37.6400, 127.0720, '공립', '남녀공학', 850, 38, '노원구', '서울');
    insertRanking.run('E-NW-01', '2', 8.0, 20.0, null, null, null, null, 2025);

    insertSchool.run('M-NW-01', '중계중학교', 'middle', '서울 노원구 중계동 328', 37.6380, 127.0680, '공립', '남녀공학', 620, 35, '노원구', '서울');
    insertRanking.run('M-NW-01', '2', 7.0, 18.0, 2.0, 0.5, 1.5, 10.0, 2025);

    // 강동구 고덕/명일동 (스크린샷 참고 지역)
    insertSchool.run('E-GD-01', '서울고덕초등학교', 'elementary', '서울 강동구 고덕동 280', 37.5570, 127.1540, '공립', '남녀공학', 950, 43, '강동구', '서울');
    insertRanking.run('E-GD-01', '1', 3.5, 11.0, null, null, null, null, 2025);

    insertSchool.run('E-GD-02', '서울고현초등학교', 'elementary', '서울 강동구 고덕동 330', 37.5530, 127.1580, '공립', '남녀공학', 780, 38, '강동구', '서울');
    insertRanking.run('E-GD-02', '1', 4.0, 13.0, null, null, null, null, 2025);

    insertSchool.run('M-GD-01', '배재중학교', 'middle', '서울 강동구 고덕동 290', 37.5555, 127.1560, '사립', '남중', 700, 42, '강동구', '서울');
    insertRanking.run('M-GD-01', '1', 1.0, 5.0, 0.0, 0.0, 2.0, 29.0, 2025);

    insertSchool.run('M-GD-02', '명일중학교', 'middle', '서울 강동구 명일동 50', 37.5490, 127.1450, '공립', '남녀공학', 650, 38, '강동구', '서울');
    insertRanking.run('M-GD-02', '1', 2.0, 8.0, 0.0, 0.0, 4.0, 15.0, 2025);

    insertSchool.run('H-GD-01', '한영외국어고등학교', 'high', '서울 강동구 고덕동 315', 37.5520, 127.1520, '사립', '남녀공학', 680, 55, '강동구', '서울');
    insertRanking.run('H-GD-01', '1', 1.0, 4.0, null, null, null, null, 2025);

    insertSchool.run('E-GD-03', '서울강명초등학교', 'elementary', '서울 강동구 상일동 85', 37.5500, 127.1630, '공립', '남녀공학', 820, 37, '강동구', '서울');
    insertRanking.run('E-GD-03', '1', 5.0, 15.0, null, null, null, null, 2025);

    insertSchool.run('E-GD-04', '서울강솔초등학교', 'elementary', '서울 강동구 강일동 650', 37.5610, 127.1720, '공립', '남녀공학', 600, 30, '강동구', '서울');
    insertRanking.run('E-GD-04', '2', 12.0, 25.0, null, null, null, null, 2025);
  });
  tx();
}
