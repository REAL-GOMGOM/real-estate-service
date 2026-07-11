import Link from 'next/link';
import Image from 'next/image';
import { CookieSettingsButton } from './CookieSettingsButton';

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
    <footer style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', padding: '48px 24px', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'clamp(20px, 4vw, 48px)' }}>

          {/* 브랜드 */}
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Image src="/logo.png" alt="내집" width={40} height={40} style={{ objectFit: 'contain' }} />
              <span style={{ fontWeight: 800, fontSize: '18px', color: 'var(--text-strong)' }}>내집 <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-dim)' }}>My.ZIP</span></span>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
              모든 부동산 고민의 답을 한곳에 압축하여,<br />
              누구나 쉽게 이해하도록 전해드립니다.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '16px' }}>
              ※ 내집(My.ZIP)의 데이터는 참고용이며, 투자·매수 결정은 본인의 재무 상황을 고려하고 전문가와 상담한 후 신중히 판단하시기 바랍니다.
            </p>
          </div>

          {/* 링크 그룹 */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-strong)', marginBottom: '20px' }}>{title}</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} style={{ fontSize: '14px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-dim)' }}>© 2026 내집(My.ZIP). All rights reserved.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', color: 'var(--text-dim)' }}>
            <span>데이터: 국토교통부 · 한국부동산원 · NEIS</span>
            <span style={{ color: 'var(--border-hover)' }}>|</span>
            <CookieSettingsButton />
          </div>
        </div>
      </div>
    </footer>
  );
}
