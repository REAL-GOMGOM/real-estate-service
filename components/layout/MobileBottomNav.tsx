'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getMobileMoreNavigation, isNavigationActive } from '@/lib/site-navigation';
import {
  BarChart3,
  Building2,
  CalendarDays,
  Calculator,
  Home,
  Map,
  MapPin,
  MoreHorizontal,
  Newspaper,
  TrendingUp,
} from 'lucide-react';

const PRIMARY_ITEMS = [
  { label: '홈', href: '/', Icon: Home, matches: (pathname: string) => pathname === '/' },
  {
    label: '실거래',
    href: '/transactions',
    Icon: Building2,
    matches: (pathname: string) => pathname === '/transactions'
      || pathname.startsWith('/transactions/')
      || pathname.startsWith('/apt/'),
  },
  {
    label: '지역',
    href: '/region',
    Icon: MapPin,
    matches: (pathname: string) => pathname === '/region' || pathname.startsWith('/region/'),
  },
  {
    label: '청약',
    href: '/subscription',
    Icon: CalendarDays,
    matches: (pathname: string) => pathname === '/subscription' || pathname.startsWith('/subscription/'),
  },
] as const;

const MORE_ICONS: Record<string, typeof BarChart3> = {
  '/highlights': BarChart3,
  '/location-map': Map,
  '/market': TrendingUp,
  '/loan': Calculator,
  '/calendar': CalendarDays,
  '/blog': Newspaper,
};

const EXCLUDED_ROUTE_PREFIXES = ['/admin', '/preview'] as const;

export function shouldShowMobileBottomNav(pathname: string): boolean {
  return !EXCLUDED_ROUTE_PREFIXES.some((prefix) => (
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  ));
}

function isMoreRoute(pathname: string): boolean {
  return !PRIMARY_ITEMS.some((item) => item.matches(pathname));
}

function MobileBottomNavContent({ pathname }: { pathname: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const firstMoreLinkRef = useRef<HTMLAnchorElement>(null);
  const morePanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (menuOpen) firstMoreLinkRef.current?.focus();
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const closeMenuAndRestoreFocus = () => {
    setMenuOpen(false);
    moreButtonRef.current?.focus();
  };
  const moreActive = menuOpen || isMoreRoute(pathname);

  return (
    <div
      className="nz-mobile-bottom-nav-root"
      onKeyDown={(event) => {
        if (!menuOpen) return;

        if (event.key === 'Escape') {
          event.preventDefault();
          closeMenuAndRestoreFocus();
          return;
        }

        if (event.key !== 'Tab') return;
        const links = morePanelRef.current?.querySelectorAll<HTMLAnchorElement>('a[href]');
        if (!links || links.length === 0) return;
        const firstLink = links[0];
        const lastLink = links[links.length - 1];

        if (event.shiftKey && document.activeElement === firstLink) {
          event.preventDefault();
          lastLink.focus();
        } else if (!event.shiftKey && document.activeElement === lastLink) {
          event.preventDefault();
          firstLink.focus();
        }
      }}
    >
      <div className="nz-mobile-bottom-nav-spacer" aria-hidden="true" />

      {menuOpen ? (
        <>
          <button
            type="button"
            className="nz-mobile-bottom-nav-backdrop"
            aria-label="더보기 메뉴 닫기"
            tabIndex={-1}
            onClick={closeMenuAndRestoreFocus}
          />
          <nav
            ref={morePanelRef}
            id="mobile-more-navigation"
            className="nz-mobile-more-panel"
            aria-label="추가 메뉴"
          >
            <p className="nz-mobile-more-title">더 둘러보기</p>
            <div className="nz-mobile-more-grid">
              {getMobileMoreNavigation().map(({ label, href }, index) => {
                const Icon = MORE_ICONS[href] ?? Building2;
                const active = isNavigationActive(href, pathname);
                return (
                  <Link
                    key={href}
                    ref={index === 0 ? firstMoreLinkRef : undefined}
                    href={href}
                    className="nz-mobile-more-link"
                    aria-current={active ? 'page' : undefined}
                    onClick={closeMenu}
                  >
                    <Icon aria-hidden="true" size={18} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
        </>
      ) : null}

      <nav className="nz-mobile-bottom-nav" aria-label="모바일 하단 메뉴">
        {PRIMARY_ITEMS.map(({ label, href, Icon, matches }) => {
          const active = matches(pathname);
          return (
            <Link
              key={href}
              href={href}
              className="nz-mobile-bottom-nav-item"
              data-active={active ? 'true' : undefined}
              aria-current={active ? 'page' : undefined}
              onClick={closeMenu}
            >
              <Icon aria-hidden="true" size={21} />
              <span>{label}</span>
            </Link>
          );
        })}

        <button
          ref={moreButtonRef}
          type="button"
          className="nz-mobile-bottom-nav-item"
          data-active={moreActive ? 'true' : undefined}
          aria-expanded={menuOpen}
          aria-controls="mobile-more-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal aria-hidden="true" size={21} />
          <span>더보기</span>
        </button>
      </nav>
    </div>
  );
}

export default function MobileBottomNav() {
  const pathname = usePathname();

  if (!shouldShowMobileBottomNav(pathname)) return null;

  // 경로가 바뀌면 하위 컴포넌트를 새로 만들어 열린 더보기 상태와 포커스를 초기화한다.
  return <MobileBottomNavContent key={pathname} pathname={pathname} />;
}
