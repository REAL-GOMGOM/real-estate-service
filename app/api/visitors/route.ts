import { NextResponse } from 'next/server';

function tryDb() {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(process.cwd(), 'data', 'realestate.db'));
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE IF NOT EXISTS visitor_counts (date TEXT PRIMARY KEY, count INTEGER DEFAULT 0)');
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('INSERT INTO visitor_counts (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1').run(today);
    const todayRow = db.prepare('SELECT count FROM visitor_counts WHERE date = ?').get(today) as { count: number } | undefined;
    const totalRow = db.prepare('SELECT SUM(count) as total FROM visitor_counts').get() as { total: number } | undefined;
    db.close();
    return { today: todayRow?.count ?? 0, total: totalRow?.total ?? 0 };
  } catch {
    return null;
  }
}

export async function GET() {
  // SQLite 가능하면 사용, 아니면 스킵
  const data = tryDb();
  if (data) {
    return NextResponse.json(data);
  }
  // Vercel 등 서버리스: 방문자 카운터 비활성
  return NextResponse.json({ today: 0, total: 0, unavailable: true });
}
