'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Menu, X, Sun, Moon, ChevronDown } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type NavChild = { label: string; href: string; desc?: string };
type NavItem =
  | { label: string; href: string; children?: never }
  | { label: string; href?: never; children: NavChild[] };

const NAV_ITEMS: NavItem[] = [
  { label: '실거래', href: '/transactions' },
  { label: '랭킹', href: '/ranking' },
  {
    label: '분석',
    children: [
      { label: '아파트 차트', href: '/chart', desc: '실거래가 시세 차트 분석' },
      { label: '실질가치', href: '/dollar', desc: '달러·BTC·금 기준 비교' },
      { label: '변동률 지도', href: '/price-map', desc: '지역별 가격 변동률' },
      { label: '갭분석', href: '/gap-analysis', desc: '매매가-전세가 갭 비교' },
      { label: '갭투자 가이드', href: '/gap-guide', desc: '갭투자 전략 시뮬레이션' },
    ],
  },
  { label: '부동산지도', href: '/location-map' },
  { label: '청약', href: '/subscription' },
  { label: '경제달력', href: '/calendar' },
  { label: '뉴스', href: '/news' },
];

function isChildActive(children: NavChild[], pathname: string): boolean {
  return children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'));
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
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
        borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border)',
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
              if (item.children) {
                const groupActive = isChildActive(item.children, pathname);
                return (
                  <div
                    key={item.label}
                    style={{ position: 'relative' }}
                    onMouseEnter={() => setOpenDropdown(item.label)}
                    onMouseLeave={() => setOpenDropdown(null)}
                  >
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', gap: '3px',
                        fontSize: '13.5px', fontWeight: groupActive ? 600 : 500,
                        color: groupActive ? 'var(--accent)' : 'var(--text-muted)',
                        paddingBottom: '2px',
                        transition: 'color 0.15s',
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '0', margin: '0',
                        borderBottomWidth: '2px', borderBottomStyle: 'solid',
                        borderBottomColor: groupActive ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      {item.label}
                      <ChevronDown size={13} style={{
                        transition: 'transform 0.2s',
                        transform: openDropdown === item.label ? 'rotate(180deg)' : 'rotate(0deg)',
                      }} />
                    </button>

                    {openDropdown === item.label && (
                      <div
                        style={{
                          position: 'absolute', top: '100%', left: '-12px',
                          paddingTop: '8px',
                          zIndex: 100,
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                            padding: '8px',
                            minWidth: '240px',
                          }}
                        >
                        {item.children.map((child) => {
                          const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              style={{
                                display: 'block', padding: '10px 14px', borderRadius: '8px',
                                textDecoration: 'none',
                                transition: 'background-color 0.15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              <span style={{
                                fontSize: '14px', fontWeight: 600,
                                color: childActive ? 'var(--accent)' : 'var(--text-primary)',
                                display: 'block',
                              }}>
                                {child.label}
                              </span>
                              {child.desc && (
                                <span style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '2px', display: 'block' }}>
                                  {child.desc}
                                </span>
                              )}
                            </Link>
                          );
                        })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }

              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    fontSize: '13.5px', fontWeight: active ? 600 : 500,
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    textDecoration: 'none',
                    borderBottomWidth: '2px', borderBottomStyle: 'solid',
                    borderBottomColor: active ? 'var(--accent)' : 'transparent',
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
            if (item.children) {
              const isOpen = openAccordion === item.label;
              const groupActive = isChildActive(item.children, pathname);
              return (
                <div key={item.label} style={{ marginBottom: '4px' }}>
                  <button
                    onClick={() => setOpenAccordion(isOpen ? null : item.label)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '12px 16px', borderRadius: '10px',
                      fontSize: '15px', fontWeight: 700,
                      color: groupActive ? 'var(--accent)' : 'var(--text-secondary)',
                      backgroundColor: groupActive ? 'var(--accent-bg)' : 'var(--bg-overlay)',
                      border: 'none', cursor: 'pointer',
                      borderLeft: groupActive ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    {item.label}
                    <ChevronDown size={16} style={{
                      transition: 'transform 0.2s',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }} />
                  </button>

                  {isOpen && (
                    <div style={{ paddingLeft: '20px', marginTop: '4px' }}>
                      {item.children.map((child) => {
                        const childActive = pathname === child.href || pathname.startsWith(child.href + '/');
                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            style={{
                              display: 'block', padding: '10px 16px', borderRadius: '10px',
                              fontSize: '14px', fontWeight: childActive ? 600 : 500,
                              color: childActive ? 'var(--accent)' : 'var(--text-secondary)',
                              textDecoration: 'none',
                              backgroundColor: childActive ? 'var(--accent-bg)' : 'transparent',
                              marginBottom: '2px',
                              borderLeft: childActive ? '3px solid var(--accent)' : '3px solid transparent',
                            }}
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {child.label}
                            {child.desc && (
                              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                {child.desc}
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

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
