'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, TrendingUp } from 'lucide-react';

const NAV_ITEMS = [
  { label: '시세 분석',         href: '/market' },
  { label: '아파트 차트',       href: '/chart' },
  { label: '실거래 내역',       href: '/transactions' },
  { label: '실질 가치 비교',    href: '/dollar' },
  { label: '입지 지도',         href: '/location-map' },
  { label: '청약 정보',         href: '/subscription' },
  { label: '뉴스',              href: '/news' },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: 'rgba(10, 14, 26, 0.92)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>

          {/* 로고 */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={18} color="white" />
            </div>
            <span style={{ fontWeight: 700, fontSize: '17px', color: '#F1F5F9' }}>부동산 인사이트</span>
          </Link>

          {/* 데스크탑 네비게이션 */}
          <nav style={{ alignItems: 'center', gap: '32px' }} className="hidden md:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: '14px', fontWeight: active ? 600 : 500,
                    color: active ? '#FFFFFF' : '#CBD5E1',
                    textDecoration: 'none',
                    borderBottom: active ? '2px solid #3B82F6' : '2px solid transparent',
                    paddingBottom: '2px',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* CTA 버튼 */}
          <div style={{ alignItems: 'center', gap: '12px' }} className="hidden md:flex">
            <button style={{ padding: '8px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 500, color: '#94A3B8', border: '1px solid rgba(255,255,255,0.12)', backgroundColor: 'transparent', cursor: 'pointer' }}>
              로그인
            </button>
            <button style={{ padding: '8px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 500, color: 'white', backgroundColor: '#3B82F6', border: 'none', cursor: 'pointer' }}>
              시작하기
            </button>
          </div>

          {/* 모바일 메뉴 버튼 */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{ padding: '8px', color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}
            className="md:hidden"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {isMenuOpen && (
        <div style={{ backgroundColor: 'rgba(10, 14, 26, 0.98)', padding: '8px 24px 16px' }} className="md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block', padding: '12px 16px', borderRadius: '10px',
                  fontSize: '14px', fontWeight: active ? 600 : 500,
                  color: active ? '#FFFFFF' : '#CBD5E1',
                  textDecoration: 'none',
                  backgroundColor: active ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
                  marginBottom: '4px',
                  borderLeft: active ? '3px solid #3B82F6' : '3px solid transparent',
                }}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}