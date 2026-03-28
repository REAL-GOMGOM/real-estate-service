import { NextRequest, NextResponse } from 'next/server';

// 더미 이벤트 (SQLite 사용 불가 시 fallback)
const DUMMY_EVENTS = [
  { id: 1, event_date: '2026-03-02', category: 'subscription', title: '래미안 원베일리 특별공급', description: '서초구 반포동, 총 2,990세대', source_url: null, icon: '🏠', importance: 'high' },
  { id: 2, event_date: '2026-03-05', category: 'rate', title: '한국은행 기준금리 결정', description: '2026년 3월 금통위 회의', source_url: null, icon: '🏦', importance: 'high' },
  { id: 3, event_date: '2026-03-07', category: 'policy', title: '주택공급 확대방안 발표', description: '국토부 보도자료', source_url: null, icon: '📋', importance: 'normal' },
  { id: 4, event_date: '2026-03-10', category: 'subscription', title: '힐스테이트 과천 1순위', description: '과천시 별양동, 총 1,500세대', source_url: null, icon: '🏠', importance: 'high' },
  { id: 5, event_date: '2026-03-12', category: 'loan', title: 'DSR 규제 강화 시행', description: '금융위원회 고시', source_url: null, icon: '💰', importance: 'high' },
  { id: 6, event_date: '2026-03-15', category: 'index', title: '3월 주간 아파트 동향', description: '한국부동산원 발표', source_url: null, icon: '📊', importance: 'normal' },
  { id: 7, event_date: '2026-03-15', category: 'move_in', title: '잠실 르엘 입주 시작', description: '송파구 잠실동, 2,678세대', source_url: null, icon: '🏗️', importance: 'normal' },
  { id: 8, event_date: '2026-03-18', category: 'rate', title: 'FOMC 회의 결과 발표', description: '미국 연준 금리 결정', source_url: null, icon: '🏦', importance: 'high' },
  { id: 9, event_date: '2026-03-20', category: 'subscription', title: 'e편한세상 시흥 청약', description: '시흥시 정왕동, 총 800세대', source_url: null, icon: '🏠', importance: 'normal' },
  { id: 10, event_date: '2026-03-22', category: 'policy', title: '부동산 세제 개편안 공청회', description: '기획재정부 주관', source_url: null, icon: '📋', importance: 'normal' },
  { id: 11, event_date: '2026-03-25', category: 'other', title: '부동산 투자 세미나', description: '삼성동 코엑스', source_url: null, icon: '📌', importance: 'low' },
  { id: 12, event_date: '2026-03-27', category: 'index', title: '주간 아파트 가격 동향', description: '한국부동산원 발표', source_url: null, icon: '📊', importance: 'normal' },
  { id: 13, event_date: '2026-03-28', category: 'move_in', title: '올림픽파크포레온 입주', description: '강동구 둔촌동, 12,032세대', source_url: null, icon: '🏗️', importance: 'high' },
  { id: 14, event_date: '2026-03-30', category: 'loan', title: '전세대출 한도 조정 시행', description: '금융위 시행령 개정', source_url: null, icon: '💰', importance: 'normal' },
  { id: 15, event_date: '2026-04-01', category: 'subscription', title: '래미안 원펜타스 청약', description: '서초구 반포동, 641세대', source_url: null, icon: '🏠', importance: 'high' },
  { id: 16, event_date: '2026-04-10', category: 'rate', title: '한국은행 기준금리 결정', description: '2026년 4월 금통위', source_url: null, icon: '🏦', importance: 'high' },
  { id: 17, event_date: '2026-02-05', category: 'rate', title: '한국은행 기준금리 동결', description: '기준금리 2.75% 유지', source_url: null, icon: '🏦', importance: 'high' },
  { id: 18, event_date: '2026-02-20', category: 'subscription', title: '디에이치 방배 청약', description: '서초구 방배동, 3,064세대', source_url: null, icon: '🏠', importance: 'high' },
];

function tryDbEvents(year: number, month: number) {
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.join(process.cwd(), 'data', 'calendar.db'), { readonly: true });
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const rows = db.prepare(
      'SELECT id, event_date, category, title, description, source_url, icon, importance FROM calendar_events WHERE event_date >= ? AND event_date < ? ORDER BY event_date ASC'
    ).all(startDate, endDate);
    db.close();
    return rows;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const now = new Date();
    const year = Number(searchParams.get('year')) || now.getFullYear();
    const month = Number(searchParams.get('month')) || now.getMonth() + 1;

    // 1) SQLite 시도
    const dbEvents = tryDbEvents(year, month);
    if (dbEvents && dbEvents.length > 0) {
      return NextResponse.json({ events: dbEvents });
    }

    // 2) Fallback: 더미 데이터
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const filtered = DUMMY_EVENTS.filter((e) => e.event_date.startsWith(prefix));
    return NextResponse.json({ events: filtered });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '서버 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
