import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'realestate.db');

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitor_counts (
      date TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    )
  `);
  return db;
}

export async function GET() {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    // 오늘 방문자 +1
    db.prepare(`
      INSERT INTO visitor_counts (date, count) VALUES (?, 1)
      ON CONFLICT(date) DO UPDATE SET count = count + 1
    `).run(today);

    // 오늘 방문자
    const todayRow = db.prepare('SELECT count FROM visitor_counts WHERE date = ?').get(today) as { count: number } | undefined;

    // 누적 방문자
    const totalRow = db.prepare('SELECT SUM(count) as total FROM visitor_counts').get() as { total: number } | undefined;

    db.close();

    return NextResponse.json({
      today: todayRow?.count ?? 0,
      total: totalRow?.total ?? 0,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
