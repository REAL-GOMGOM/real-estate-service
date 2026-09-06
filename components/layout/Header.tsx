'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import MobileNav from '@/components/landing/MobileNav';
import { getSiteNavigation, isNavigationActive } from '@/lib/site-navigation';

type HeaderProps = { variant?: 'default' | 'landing' };

function HeaderContent({ pathname, variant }: { pathname: string; variant: HeaderProps['variant'] }) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const desktopNavRef = useRef<HTMLElement>(null);
  const landing = variant === 'landing';

  useEffect(() => {
    if (!openDropdown) return;
    const closeOutside = (event: PointerEvent) => {
      if (!desktopNavRef.current?.contains(event.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [openDropdown]);

  return (
    <header style={{
      position: landing ? 'sticky' : 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      backgroundColor: 'var(--bg-header)', borderBottom: '1px solid var(--border)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ maxWidth: landing ? 1200 : 1280, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, position: 'relative', gap: 12 }}>
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 }}>
            <Image src="/logo.png" alt="내집(My.ZIP)" width={landing ? 32 : 44} height={landing ? 32 : 44} style={{ objectFit: 'contain' }} priority />
            {landing ? (
              <>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>내집</span>
                <span className="hidden sm:inline" style={{ fontFamily: 'var(--font-sg)', fontSize: 13, fontWeight: 600, color: 'var(--text-dim)', letterSpacing: '0.04em' }}>My.ZIP</span>
              </>
            ) : null}
          </Link>

          <nav ref={desktopNavRef} aria-label="주요 메뉴" className="hidden lg:flex" style={{ alignItems: 'center', gap: 22, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
            {getSiteNavigation().map((item, index) => {
              if ('children' in item) {
                const active = item.children.some((child) => isNavigationActive(child.href, pathname));
                const expanded = openDropdown === item.label;
                const panelId = `desktop-nav-group-${index}`;
                return (
                  <div
                    key={item.label}
                    style={{ position: 'relative' }}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpenDropdown(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape' && expanded) {
                        event.preventDefault();
                        setOpenDropdown(null);
                        dropdownButtonRefs.current[item.label]?.focus();
                      }
                    }}
                  >
                    <button
                      ref={(element) => { dropdownButtonRefs.current[item.label] = element; }}
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setOpenDropdown(expanded ? null : item.label)}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, minHeight: 44, fontSize: 14, fontWeight: active ? 700 : 600, color: active ? 'var(--accent)' : 'var(--text-secondary)', background: 'none', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}
                    >
                      {item.label}
                      <ChevronDown aria-hidden="true" size={13} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
                    </button>
                    {expanded ? (
                      <div id={panelId} style={{ position: 'absolute', top: '100%', left: -12, paddingTop: 8, zIndex: 100 }}>
                        <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', padding: 8, minWidth: 240 }}>
                          {item.children.map((child) => {
                            const childActive = isNavigationActive(child.href, pathname);
                            return (
                              <Link
                                key={child.href}
                                href={child.href}
                                aria-current={childActive ? 'page' : undefined}
                                onClick={() => setOpenDropdown(null)}
                                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 8, textDecoration: 'none', background: childActive ? 'var(--accent-bg)' : undefined }}
                              >
                                <span aria-hidden="true" style={{ fontSize: 18, lineHeight: '20px', flexShrink: 0 }}>{child.emoji}</span>
                                <span style={{ flex: 1 }}>
                                  <span style={{ fontSize: 15, fontWeight: 600, color: childActive ? 'var(--accent)' : 'var(--text-primary)', display: 'block' }}>{child.label}</span>
                                  {child.desc ? <span style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, display: 'block' }}>{child.desc}</span> : null}
                                </span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              }
              const active = isNavigationActive(item.href, pathname);
              return (
                <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', minHeight: 44, fontSize: 14, fontWeight: active ? 700 : 600, color: active ? 'var(--accent)' : 'var(--text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}` }}>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {landing ? (
              <Link href="/region" style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--accent)', color: '#FFFFFF', fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>지역 둘러보기</Link>
            ) : <div aria-hidden="true" className="hidden lg:block" style={{ width: 44 }} />}
            <MobileNav />
          </div>
        </div>
      </div>
    </header>
  );
}

/** Keyed by route so browser navigation also resets open menus without a state effect. */
export default function Header({ variant = 'default' }: HeaderProps) {
  const pathname = usePathname();
  return <HeaderContent key={pathname} pathname={pathname} variant={variant} />;
}
