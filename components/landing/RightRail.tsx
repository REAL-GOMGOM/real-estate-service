import Link from 'next/link';
import { getTodayReport } from '@/lib/today-report';

/**
 * 메인 우측 레일 — 사이클 Z2 (TODAY'S REPORT 실데이터화).
 * 다크 네이비 패널: 수도권 4구 국평 최근 30일 평균·직전 30일 대비 (MOLIT 실집계).
 * 집계 불가 시 패널에 준비 중 표기 — 목업 수치는 완전 제거.
 */

interface TopLocationItem {
  rank: number;
  name: string;
  score: number;
  id: string;
}

interface RightRailProps {
  topLocations: TopLocationItem[];
}

export async function RightRail({ topLocations }: RightRailProps) {
  const report = await getTodayReport().catch(() => null);

  return (
    <aside className="flex flex-col gap-4 min-w-0">
      {/* TODAY'S REPORT — 다크 네이비 패널 (실집계) */}
      <div style={{ backgroundColor: '#0E2A66', borderRadius: '14px', padding: '18px', color: '#FFFFFF' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px', color: '#8FB0F0', marginBottom: '12px' }}>
          TODAY&apos;S REPORT
        </div>
        <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>수도권 국평 실거래</div>
        <div style={{ fontSize: '10.5px', color: 'rgba(255,255,255,0.45)', marginBottom: '14px' }}>
          최근 30일 84㎡ 평균 · 직전 30일 대비
        </div>
        {report ? (
          <div className="flex flex-col gap-3">
            {report.map((d) => {
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
        ) : (
          <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0 }}>
            오늘 집계를 준비하고 있어요.<br />잠시 후 다시 확인해주세요.
          </p>
        )}
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
