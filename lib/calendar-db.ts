import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'calendar.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_date DATE NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('subscription','rate','move_in','policy','loan','index','other')),
        title TEXT NOT NULL,
        description TEXT,
        source_url TEXT,
        icon TEXT,
        importance TEXT DEFAULT 'normal' CHECK(importance IN ('high','normal','low')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_date, title)
      );
      CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_events(event_date);
      CREATE INDEX IF NOT EXISTS idx_calendar_category ON calendar_events(category);
    `);
  }
  return _db;
}

export function getEventsByMonth(year: number, month: number) {
  const db = getDb();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  return db.prepare(`
    SELECT id, event_date, category, title, description, source_url, icon, importance
    FROM calendar_events
    WHERE event_date >= ? AND event_date < ?
    ORDER BY event_date ASC, importance DESC
  `).all(startDate, endDate);
}

export function seedDummyEvents() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as cnt FROM calendar_events').get() as { cnt: number };
  if (count.cnt > 0) return;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO calendar_events (event_date, category, title, description, icon, importance)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const events = [
    ['2026-03-02', 'subscription', '래미안 원베일리 특별공급', '서초구 반포동, 총 2,990세대', '🏠', 'high'],
    ['2026-03-05', 'rate', '한국은행 기준금리 결정', '2026년 3월 금통위 회의', '🏦', 'high'],
    ['2026-03-07', 'policy', '주택공급 확대방안 발표', '국토부 보도자료', '📋', 'normal'],
    ['2026-03-10', 'subscription', '힐스테이트 과천 1순위', '과천시 별양동, 총 1,500세대', '🏠', 'high'],
    ['2026-03-12', 'loan', 'DSR 규제 강화 시행', '금융위원회 고시', '💰', 'high'],
    ['2026-03-15', 'index', '3월 주간 아파트 동향', '한국부동산원 발표', '📊', 'normal'],
    ['2026-03-15', 'move_in', '잠실 르엘 입주 시작', '송파구 잠실동, 2,678세대', '🏗️', 'normal'],
    ['2026-03-18', 'rate', 'FOMC 회의 결과 발표', '미국 연준 금리 결정', '🏦', 'high'],
    ['2026-03-20', 'subscription', 'e편한세상 시흥 청약', '시흥시 정왕동, 총 800세대', '🏠', 'normal'],
    ['2026-03-22', 'policy', '부동산 세제 개편안 공청회', '기획재정부 주관', '📋', 'normal'],
    ['2026-03-25', 'other', '부동산 투자 세미나', '삼성동 코엑스', '📌', 'low'],
    ['2026-03-27', 'index', '주간 아파트 가격 동향', '한국부동산원 발표', '📊', 'normal'],
    ['2026-03-28', 'move_in', '올림픽파크포레온 입주', '강동구 둔촌동, 12,032세대', '🏗️', 'high'],
    ['2026-03-30', 'loan', '전세대출 한도 조정 시행', '금융위 시행령 개정', '💰', 'normal'],
    // 4월 일부
    ['2026-04-01', 'subscription', '래미안 원펜타스 청약', '서초구 반포동, 641세대', '🏠', 'high'],
    ['2026-04-10', 'rate', '한국은행 기준금리 결정', '2026년 4월 금통위', '🏦', 'high'],
    ['2026-04-15', 'index', '4월 주간 아파트 동향', '한국부동산원 발표', '📊', 'normal'],
    // 2월
    ['2026-02-05', 'rate', '한국은행 기준금리 동결', '기준금리 2.75% 유지', '🏦', 'high'],
    ['2026-02-15', 'index', '2월 주간 아파트 동향', '한국부동산원 발표', '📊', 'normal'],
    ['2026-02-20', 'subscription', '디에이치 방배 청약', '서초구 방배동, 3,064세대', '🏠', 'high'],
  ];

  const tx = db.transaction(() => {
    for (const e of events) {
      insert.run(...e);
    }
  });
  tx();
}
