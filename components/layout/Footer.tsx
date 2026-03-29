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
    <footer style={{ backgroundColor: 'var(--text-strong)', color: 'rgba(255,255,255,0.7)', padding: '48px 24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '48px' }}>

          {/* 브랜드 */}
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontWeight: 800, fontSize: '20px', color: '#FFFFFF' }}>내집</span>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>Naezip</span>
            </div>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.8' }}>
              모든 부동산 고민의 답을 한곳에 압축하여,<br />
              누구나 쉽게 이해하도록 전해드립니다.
            </p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '16px' }}>
              ※ 내집의 데이터는 참고용이에요. 투자 결정 전에 꼭 전문가에 상담하세요.
            </p>
          </div>

          {/* 링크 그룹 */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', marginBottom: '20px' }}>{title}</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>© 2026 내집(Naezip). All rights reserved.</p>
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>데이터: 국토교통부 · 한국부동산원 · NEIS</p>
        </div>
      </div>
    </footer>
  );
}
