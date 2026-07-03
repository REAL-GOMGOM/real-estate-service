'use client';

export interface TickerItem {
  region: string;
  apt: string;
  price: string;
  area: string;
  time: string;
}

interface LiveTickerProps {
  items: TickerItem[];
}

/**
 * 사이클 U — 다크 히어로 하단 LIVE 티커 스트립 (시안 스크린 12).
 * 레드 LIVE 블록 + 무한 스크롤 트랙. 히어로(다크 네이비) 전용 스타일.
 */
export function LiveTicker({ items }: LiveTickerProps) {
  const doubled = items.length > 0 ? [...items, ...items] : [];

  return (
    <div
      className="flex items-stretch overflow-hidden"
      style={{
        backgroundColor: 'rgba(6,17,42,0.5)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <style>{`
        @keyframes naezipTicker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .naezip-ticker-track {
          animation: naezipTicker 60s linear infinite;
          width: max-content;
        }
        .naezip-ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* LIVE 뱃지 블록 */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        style={{
          padding: '11px 18px',
          backgroundColor: '#E23B3B',
          color: '#FFFFFF',
          fontSize: '12px',
          fontWeight: 800,
          letterSpacing: '0.5px',
        }}
      >
        <span className="relative flex">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#FFFFFF' }} />
          <span
            className="absolute inset-0 w-1.5 h-1.5 rounded-full animate-ping"
            style={{ backgroundColor: '#FFFFFF', opacity: 0.7 }}
          />
        </span>
        LIVE
      </div>

      {/* 스크롤 트랙 */}
      <div className="relative flex-1 overflow-hidden whitespace-nowrap">
        {items.length === 0 ? (
          <div style={{ padding: '11px 18px', fontSize: '13px', color: '#C9D6F0' }}>
            최신 실거래 데이터를 불러오는 중...
          </div>
        ) : (
          <div className="naezip-ticker-track inline-flex items-center" style={{ padding: '11px 0' }}>
            {doubled.map((item, i) => (
              <span
                key={`${item.region}-${item.apt}-${i}`}
                className="shrink-0"
                style={{ margin: '0 22px', fontSize: '13px', color: '#C9D6F0' }}
              >
                {item.region} · {item.apt}{' '}
                <b style={{ color: '#FFFFFF', fontWeight: 700 }}>{item.price}</b>{' '}
                <span style={{ color: 'rgba(201,214,240,0.65)', fontSize: '12px' }}>
                  {item.area} · {item.time}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 출처 (데스크탑) */}
      <div
        className="hidden lg:flex items-center shrink-0"
        style={{ padding: '11px 18px', fontSize: '11px', color: 'rgba(201,214,240,0.55)' }}
      >
        출처 국토교통부 · 한국부동산원
      </div>
    </div>
  );
}
