import Link from 'next/link';

/**
 * 사이클 U 메인 좌측 필터 레일 — 시안 1a.
 * 1차는 프레젠테이션 레일: 지역 칩은 실거래 조회로, 지도 카드는 입지지도로 연결.
 * 거래 유형·가격대 실필터 연동은 후속 (피드 실데이터화와 함께).
 */
const REGION_CHIPS = ['강남구', '서초구', '송파구', '마포구', '용산구'];

export function FilterRail() {
  return (
    <aside className="hidden lg:flex flex-col gap-4">
      {/* 지도 미리보기 카드 */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          overflow: 'hidden',
        }}
      >
        <Link href="/location-map" style={{ display: 'block', position: 'relative', height: '132px', backgroundColor: '#EEF2FA', borderBottom: '1px solid var(--border)' }}>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(#DCE4F2 1px, transparent 1px), linear-gradient(90deg, #DCE4F2 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              opacity: 0.7,
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute', top: '44px', left: '70px', width: '34px', height: '34px',
              borderRadius: '50% 50% 50% 2px', backgroundColor: 'var(--accent)',
              boxShadow: '0 6px 14px -4px rgba(27,77,219,0.6)',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute', top: '70px', left: '130px', width: '24px', height: '24px',
              borderRadius: '50% 50% 50% 2px', backgroundColor: '#5B84E8',
            }}
          />
          <span
            style={{
              position: 'absolute', bottom: '8px', left: '8px',
              backgroundColor: 'rgba(255,255,255,0.92)',
              fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
              padding: '4px 9px', borderRadius: '6px',
            }}
          >
            지도로 보기 →
          </span>
        </Link>
        <div style={{ padding: '14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '10px', letterSpacing: '0.2px' }}>
            지역 필터
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REGION_CHIPS.map((r, i) => (
              <Link
                key={r}
                href={`/transactions?q=${encodeURIComponent(r)}`}
                style={{
                  backgroundColor: i === 0 ? 'var(--accent)' : 'var(--btn-bg)',
                  color: i === 0 ? '#FFFFFF' : 'var(--text-muted)',
                  fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: '8px',
                }}
              >
                {r}
              </Link>
            ))}
            <Link
              href="/transactions"
              style={{
                backgroundColor: 'var(--btn-bg)', color: 'var(--text-muted)',
                fontSize: '12px', fontWeight: 600, padding: '5px 10px', borderRadius: '8px',
              }}
            >
              + 전체
            </Link>
          </div>
        </div>
      </div>

      {/* 거래 유형 · 가격대 (프레젠테이션 — 실필터는 후속) */}
      <div
        style={{
          backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: '14px', padding: '14px',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '11px' }}>거래 유형</div>
        <div className="flex flex-col gap-2" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center"
              style={{ width: '16px', height: '16px', borderRadius: '5px', backgroundColor: 'var(--accent)', color: '#fff', fontSize: '10px' }}
            >
              ✓
            </span>
            매매
          </span>
          <span className="flex items-center gap-2">
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '1.5px solid #CDD5E4' }} />
            전세
          </span>
          <span className="flex items-center gap-2">
            <span style={{ width: '16px', height: '16px', borderRadius: '5px', border: '1.5px solid #CDD5E4' }} />
            월세
          </span>
        </div>
        <div style={{ height: '1px', backgroundColor: '#EEF1F7', margin: '14px 0' }} />
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-strong)', marginBottom: '11px' }}>가격대</div>
        <div className="flex flex-col gap-1.5" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          <span>~ 10억</span>
          <span>10억 ~ 20억</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>20억 이상 ✓</span>
        </div>
      </div>
    </aside>
  );
}
