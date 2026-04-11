import Link from 'next/link';

const FOOTER_LINKS = {
  '서비스': [
    { label: '부동산 지도', href: '/location-map' },
    { label: '실거래 조회', href: '/transactions' },
    { label: '청약 정보', href: '/subscription' },
    { label: '변동률 지도', href: '/price-map' },
  ],
  '안내': [
    { label: '이용약관', href: '/terms' },
    { label: '개인정보처리방침', href: '/privacy' },
    { label: '문의하기', href: '/contact' },
  ],
};

export default function Footer() {
  return (
    <footer style={{ backgroundColor: '#F5F0EB', color: '#6B5B4F', padding: '48px 24px', borderTop: '1px solid #E8DDD4' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'clamp(20px, 4vw, 48px)' }}>

          {/* 브랜드 */}
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <img src="/logo.png" alt="내집" width={40} height={40} style={{ objectFit: 'contain' }} />
              <span style={{ fontWeight: 800, fontSize: '18px', color: '#4A3F36' }}>내집 <span style={{ fontWeight: 400, fontSize: '12px', color: '#9B8E82' }}>My.ZIP</span></span>
            </div>
            <p style={{ fontSize: '14px', color: '#6B5B4F', lineHeight: '1.8' }}>
              모든 부동산 고민의 답을 한곳에 압축하여,<br />
              누구나 쉽게 이해하도록 전해드립니다.
            </p>
            <p style={{ fontSize: '12px', color: '#9B8E82', marginTop: '16px' }}>
              ※ 내집(My.ZIP)의 데이터는 참고용 입니다. 투자 및 매수 결정전 꼭 개인의 자금 사정과 전문가에게 조언을 구하시길 바랍니다.
            </p>
          </div>

          {/* 링크 그룹 */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#4A3F36', marginBottom: '20px' }}>{title}</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} style={{ fontSize: '14px', color: '#6B5B4F', textDecoration: 'none' }}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid #E8DDD4', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: '#9B8E82' }}>© 2026 내집(My.ZIP). All rights reserved.</p>
          <p style={{ fontSize: '13px', color: '#9B8E82' }}>데이터: 국토교통부 · 한국부동산원 · NEIS</p>
        </div>
      </div>
    </footer>
  );
}
