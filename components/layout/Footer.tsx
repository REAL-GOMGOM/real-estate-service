import Link from 'next/link';
import { TrendingUp } from 'lucide-react';

const FOOTER_LINKS = {
  '서비스': [
    { label: '시세 분석', href: '/market' },
    { label: '입지 지도', href: '/location-map' },
    { label: '청약 정보', href: '/subscription' },
    { label: '뉴스', href: '/news' },
  ],
  '안내': [
    { label: '이용약관', href: '/terms' },
    { label: '개인정보처리방침', href: '/privacy' },
    { label: '문의하기', href: '/contact' },
  ],
};

export default function Footer() {
  return (
    <footer style={{ backgroundColor: 'var(--bg-primary)', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '64px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '48px' }}>

          {/* 브랜드 */}
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={18} color="white" />
              </div>
              <span style={{ fontWeight: 700, fontSize: '17px', color: 'var(--text-primary)' }}>부동산 인사이트</span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-dim)', lineHeight: '1.8' }}>
              서울 및 수도권 부동산 시세 분석, 입지 점수 지도,<br />
              청약 정보를 한 곳에서 확인하세요.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '16px' }}>
              ※ 본 서비스의 데이터는 참고용이며 투자 결정의 책임은 이용자에게 있습니다.
            </p>
          </div>

          {/* 링크 그룹 */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '20px' }}>{title}</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} style={{ fontSize: '14px', color: 'var(--text-dim)', textDecoration: 'none' }}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 하단 구분선 */}
        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>© 2026 부동산 인사이트. All rights reserved.</p>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)' }}>데이터 기준: 국토교통부 실거래가 공개시스템</p>
        </div>
      </div>
    </footer>
  );
}
