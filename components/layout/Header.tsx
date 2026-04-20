'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Menu, X, ChevronDown } from 'lucide-react';

type NavChild = { label: string; href: string; desc?: string; emoji?: string };
type NavItem =
  | { label: string; href: string; children?: never; badge?: string; badgeUntil?: string }
  | { label: string; href?: never; children: NavChild[]; badge?: never; badgeUntil?: never };

const NAV_ITEMS: NavItem[] = [
  {
    label: '부동산 분석',
    children: [
      { emoji: '\uD83D\uDCB0', label: '실거래가', href: '/transactions', desc: '최근 거래된 가격' },
      { emoji: '\uD83D\uDCCA', label: '시세 차트', href: '/chart', desc: '단지별 가격 추이' },
      { emoji: '\uD83D\uDDFA\uFE0F', label: '부동산 지도', href: '/location-map', desc: '지역별 입지 점수' },
      { emoji: '\uD83C\uDFC6', label: '주간 랭킹', href: '/ranking', desc: '최고가·거래량' },
    ],
  },
  { label: '청약', href: '/subscription' },
  {
    label: '내집마련 도구',
    children: [
      { emoji: '\uD83D\uDCB3', label: '대출 계산기', href: '/loan', desc: '얼마까지 빌릴 수 있나' },
      { emoji: '\uD83C\uDFE0', label: '갭투자 가이드', href: '/gap-guide', desc: '매매-전세 전략' },
      { emoji: '\uD83D\uDCB5', label: '실질 가치', href: '/dollar', desc: '달러·금 환산 비교' },
    ],
  },
  {
    label: '시장 동향',
    children: [
      { emoji: '\uD83D\uDCC8', label: '가격 변동률', href: '/price-map', desc: '지역별 상승·하락' },
      { emoji: '\uD83D\uDD04', label: '갭 분석', href: '/gap-analysis', desc: '매매가-전세가 차이' },
      { emoji: '\uD83D\uDCC5', label: '경제달력', href: '/calendar', desc: '금리·지표 일정' },
    ],
  },
  { label: '리포트', href: '/report', badge: 'NEW', badgeUntil: '2026-05-13' },
  { label: '뉴스', href: '/news' },
];

function isChildActive(children: NavChild[], pathname: string): boolean {
  return children.some(c => pathname === c.href || pathname.startsWith(c.href + '/'));
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const pathname = usePathname();

  useEffect(() => { setNow(new Date()); }, []);

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '64px', position: 'relative' }}>

          {/* 로고 */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', width: 44 }}>
            <Image src="/logo.png" alt="내집(My.ZIP)" width={44} height={44} style={{ objectFit: 'contain' }} priority />
          </Link>

          {/* 데스크탑 네비게이션 (중앙) */}
          <nav style={{ alignItems: 'center', gap: '18px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }} className="hidden lg:flex">
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
                                display: 'flex', alignItems: 'flex-start', gap: '10px',
                                padding: '10px 14px', borderRadius: '8px',
                                textDecoration: 'none',
                                transition: 'background-color 0.15s',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                              {child.emoji && <span style={{ fontSize: '18px', lineHeight: '20px', flexShrink: 0 }}>{child.emoji}</span>}
                              <span style={{ flex: 1 }}>
                                <span style={{
                                  fontSize: '15px', fontWeight: 600,
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
                              </span>
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
              const showBadge = item.badge && item.badgeUntil && now && now < new Date(item.badgeUntil);
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
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  {item.label}
                  {showBadge && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: 'white',
                      backgroundColor: 'var(--accent)',
                      padding: '1px 5px',
                      borderRadius: '6px',
                      letterSpacing: '0.05em',
                      lineHeight: '16px',
                    }}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* 우측 균형용 빈 공간 (로고와 동일 너비) */}
          <div style={{ width: 44 }} className="hidden lg:flex">
            {/* 인증 기능 추가 시 복원
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
            */}
          </div>

          {/* 모바일: 메뉴 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="lg:hidden">
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
                              display: 'flex', alignItems: 'flex-start', gap: '10px',
                              padding: '10px 16px', borderRadius: '10px',
                              fontSize: '14px', fontWeight: childActive ? 600 : 500,
                              color: childActive ? 'var(--accent)' : 'var(--text-secondary)',
                              textDecoration: 'none',
                              backgroundColor: childActive ? 'var(--accent-bg)' : 'transparent',
                              marginBottom: '2px',
                              borderLeft: childActive ? '3px solid var(--accent)' : '3px solid transparent',
                            }}
                            onClick={() => setIsMenuOpen(false)}
                          >
                            {child.emoji && <span style={{ fontSize: '16px', lineHeight: '20px', flexShrink: 0 }}>{child.emoji}</span>}
                            <span style={{ flex: 1 }}>
                              {child.label}
                              {child.desc && (
                                <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                                  {child.desc}
                                </span>
                              )}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            const showBadge = item.badge && item.badgeUntil && now && now < new Date(item.badgeUntil);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '12px 16px', borderRadius: '10px',
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
                {showBadge && (
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'white',
                    backgroundColor: 'var(--accent)',
                    padding: '1px 5px',
                    borderRadius: '6px',
                    letterSpacing: '0.05em',
                    lineHeight: '16px',
                  }}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
