'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

const NAV_ITEMS = [
  { label: '실거래',         href: '/transactions' },
  { label: '차트',           href: '/chart' },
  { label: '실질가치',       href: '/dollar' },
  { label: '부동산지도',     href: '/location-map' },
  { label: '청약',           href: '/subscription' },
  { label: '경제달력',       href: '/calendar' },
  { label: '변동률',         href: '/price-map' },
  { label: '갭분석',         href: '/gap-analysis' },
  { label: '뉴스',           href: '/news' },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: 'var(--bg-header)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(12px)',
        transition: 'background-color 0.3s, border-color 0.3s',
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px' }}>

          {/* 로고 */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <Image src="/logo.png" alt="내집(My.ZIP)" width={44} height={44} style={{ objectFit: 'contain' }} priority />
          </Link>

          {/* 데스크탑 네비게이션 */}
          <nav style={{ alignItems: 'center', gap: '18px' }} className="hidden lg:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: '13.5px', fontWeight: active ? 600 : 500,
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    textDecoration: 'none',
                    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                    paddingBottom: '2px',
                    transition: 'color 0.15s',
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* 우측: 테마 토글 + CTA */}
          <div style={{ alignItems: 'center', gap: '10px' }} className="hidden lg:flex">
            <button
              onClick={toggleTheme}
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'var(--bg-overlay)', border: '1px solid var(--border)',
                cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.15s',
              }}
              title={theme === 'light' ? '다크 모드' : '라이트 모드'}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button style={{
              padding: '8px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 500,
              color: 'var(--text-muted)', border: '1px solid var(--border)',
              backgroundColor: 'transparent', cursor: 'pointer',
            }}>
              로그인
            </button>
            <button style={{
              padding: '8px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: 500,
              color: 'white', backgroundColor: 'var(--accent)', border: 'none', cursor: 'pointer',
            }}>
              시작하기
            </button>
          </div>

          {/* 모바일: 테마 토글 + 메뉴 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="lg:hidden">
            <button
              onClick={toggleTheme}
              style={{
                width: '36px', height: '36px', borderRadius: '10px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'var(--bg-overlay)', border: '1px solid var(--border)',
                cursor: 'pointer', color: 'var(--text-muted)',
              }}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{ padding: '8px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {isMenuOpen && (
        <div style={{ backgroundColor: 'var(--bg-primary)', padding: '8px 24px 16px', borderTop: '1px solid var(--border)' }} className="lg:hidden">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'block', padding: '12px 16px', borderRadius: '10px',
                  fontSize: '14px', fontWeight: active ? 600 : 500,
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  backgroundColor: active ? 'var(--accent-bg)' : 'var(--bg-overlay)',
                  marginBottom: '4px',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
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
