import Link from 'next/link';

/**
 * "조회를 넘어 분석까지" 프로모 바 — 사이클 X (최종 디자인 시안)
 *
 * 다크 네이비 배너 + 내집만의 기능 4칩 (입지 점수·대출 계산기·
 * 실시간 신고가 알림·출처 100% 공개). 실거래 페이지 하단 배치.
 */

const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL ?? 'https://t.me/realMyzip';

interface PromoChip {
  href:     string;
  external: boolean;
  label:    string;
  sub:      string;
  icon:     React.ReactNode;
}

const CHIPS: PromoChip[] = [
  {
    href: '/region', external: false,
    label: '입지 점수 분석', sub: '교통·학군·편의',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4DDB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" /><path d="M12 12 3 7" /><path d="m12 12 9-5" /><path d="M12 12v10" />
      </svg>
    ),
  },
  {
    href: '/loan', external: false,
    label: '대출 계산기', sub: '월 상환액·DSR',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4DDB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2.5" /><path d="M8 6h8M8 10h2M8 14h2M14 10h2v8h-2z" />
      </svg>
    ),
  },
  {
    href: TELEGRAM_URL, external: true,
    label: '실시간 신고가', sub: '그날 아침 바로',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4DDB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" />
      </svg>
    ),
  },
  {
    href: '/transactions', external: false,
    label: '출처 100% 공개', sub: '국토부·부동산원',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1B4DDB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
];

export function AnalysisPromoBar() {
  return (
    <div
      style={{
        backgroundColor: '#0E2A66', borderRadius: '16px',
        padding: '15px 18px',
        display: 'flex', alignItems: 'center', gap: '18px', flexWrap: 'wrap',
      }}
    >
      <div style={{ flexShrink: 0, paddingRight: '18px', borderRight: '1px solid rgba(255,255,255,0.14)' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#8FB4FF', letterSpacing: '0.4px', marginBottom: '3px' }}>
          내집에서만
        </div>
        <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
          조회를 넘어<br />분석까지
        </div>
      </div>
      <div
        className="grid grid-cols-2 md:grid-cols-4"
        style={{ flex: 1, gap: '9px', minWidth: '260px' }}
      >
        {CHIPS.map((chip) => {
          const inner = (
            <>
              <div style={{
                flexShrink: 0, width: '34px', height: '34px', borderRadius: '9px',
                backgroundColor: '#E8EEFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {chip.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap' }}>{chip.label}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap' }}>{chip.sub}</div>
              </div>
            </>
          );
          const style: React.CSSProperties = {
            display: 'flex', alignItems: 'center', gap: '10px',
            backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '11px',
            padding: '10px 12px', textDecoration: 'none',
          };
          return chip.external ? (
            <a key={chip.label} href={chip.href} target="_blank" rel="noopener noreferrer" style={style} className="hover:opacity-85 transition-opacity">
              {inner}
            </a>
          ) : (
            <Link key={chip.label} href={chip.href} style={style} className="hover:opacity-85 transition-opacity">
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
