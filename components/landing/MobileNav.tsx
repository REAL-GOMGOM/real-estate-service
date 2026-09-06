'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';
import { getSiteNavigation, isNavigationActive } from '@/lib/site-navigation';

function MobileNavContent({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('button, a[href]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="lg:hidden"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
        aria-expanded={open}
        aria-controls="mobile-site-navigation"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}
      >
        {open ? <X aria-hidden="true" size={22} /> : <Menu aria-hidden="true" size={22} />}
      </button>

      {open ? (
        <nav
          ref={panelRef}
          id="mobile-site-navigation"
          aria-label="모바일 주요 메뉴"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, maxHeight: 'calc(100dvh - 144px)', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0 0 14px 14px', boxShadow: 'var(--shadow-lg)', padding: '12px 16px' }}
        >
          {getSiteNavigation().map((item, index) => {
            if ('children' in item) {
              const expanded = openGroup === item.label;
              const active = item.children.some((child) => isNavigationActive(child.href, pathname));
              const panelId = `mobile-nav-group-${index}`;
              return (
                <div key={item.label} style={{ marginBottom: 4 }}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpenGroup(expanded ? null : item.label)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 44, padding: '12px 16px', borderRadius: 10, fontSize: 15, fontWeight: 700, color: active ? 'var(--accent)' : 'var(--text-secondary)', background: active ? 'var(--accent-bg)' : 'var(--bg-overlay)', border: 'none', cursor: 'pointer' }}
                  >
                    {item.label}
                    <ChevronDown aria-hidden="true" size={16} style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
                  </button>
                  {expanded ? (
                    <div id={panelId} style={{ padding: '4px 0 4px 12px' }}>
                      {item.children.map((child) => (
                        <Link key={child.href} href={child.href} aria-current={isNavigationActive(child.href, pathname) ? 'page' : undefined} onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, padding: '10px 16px', color: isNavigationActive(child.href, pathname) ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
                          <span aria-hidden="true">{child.emoji}</span>
                          <span>{child.label}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }
            return (
              <Link key={item.href} href={item.href} aria-current={isNavigationActive(item.href, pathname) ? 'page' : undefined} onClick={() => setOpen(false)} style={{ display: 'block', minHeight: 44, padding: '12px 16px', marginBottom: 4, color: isNavigationActive(item.href, pathname) ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

/** The same mobile accordion on the home and every common-header page. */
export default function MobileNav() {
  const pathname = usePathname();
  return <MobileNavContent key={pathname} pathname={pathname} />;
}
