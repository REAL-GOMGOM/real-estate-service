import Link from 'next/link';
import type { District } from './TodayReport';

/**
 * 사이클 U 메인 우측 레일 — 시안 1a.
 * 다크 네이비 TODAY'S REPORT 패널 + LOCATION SCORE TOP5 카드.
 */
interface TopLocationItem {
  rank: number;
  name: string;
  score: number;
  id: string;
}

interface RightRailProps {
  districts: District[];
  topLocations: TopLocationItem[];
}

export function RightRail({ districts, topLocations }: RightRailProps) {
  return (
    <aside className="flex flex-col gap-4 min-w-0">
      {/* TODAY'S REPORT — 다크 네이비 패널 */}
      <div style={{ backgroundColor: '#0E2A66', borderRadius: '14px', padding: '18px', color: '#FFFFFF' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: '#8FB0F0', marginBottom: '12px' }}>
          TODAY&apos;S REPORT
        </div>
        <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '14px' }}>오늘의 수도권 실거래</div>
        <div className="flex flex-col gap-3">
          {districts.map((d) => {
            const isUp = d.change >= 0;
            return (
              <div key={d.name} className="flex items-center justify-between">
                <span style={{ fontSize: '13px', color: '#C9D6F0' }}>{d.name}</span>
                <div className="text-right">
                  <span style={{ fontSize: '15px', fontWeight: 800 }}>{d.price.toFixed(1)}억</span>
                  <span
                    style={{
                      fontSize: '12px', fontWeight: 700, marginLeft: '6px',
                      // 다크 배경용 밝은 상승 레드 / 하락 블루 (한국 컨벤션)
                      color: isUp ? '#FF8A8A' : '#8FB4FF',
                    }}
                  >
                    {isUp ? '+' : ''}{d.change.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* LOCATION SCORE TOP 5 */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '16px',
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--text-dim)', marginBottom: '4px' }}>
          LOCATION SCORE · TOP 5
        </div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '12px' }}>
          이달의 최우수 입지
        </div>
        {topLocations.map((g) => (
          <Link
            key={g.id}
            href={`/region/${g.id}`}
            className="flex items-center gap-2.5 rounded-lg transition-colors hover:bg-[var(--bg-card-hover)]"
            style={{ padding: '8px 6px' }}
          >
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: '20px', height: '20px', borderRadius: '6px',
                backgroundColor: 'var(--accent-bg)', color: 'var(--accent)',
                fontSize: '11px', fontWeight: 800,
              }}
            >
              {g.rank}
            </span>
            <span className="flex-1 truncate" style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-strong)' }}>
              {g.name}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)' }}>{g.score}</span>
          </Link>
        ))}
        <Link
          href="/location-map"
          className="block text-center transition-opacity hover:opacity-80"
          style={{
            marginTop: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--accent)',
            padding: '8px', borderTop: '1px solid var(--border-light)',
          }}
        >
          전체 지도 보기 →
        </Link>
      </div>
    </aside>
  );
}
