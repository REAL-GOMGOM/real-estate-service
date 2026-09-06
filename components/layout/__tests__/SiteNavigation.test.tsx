// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('next/image', () => ({ default: () => null }));

import Header from '../Header';
import { getMobileMoreNavigation, getSiteNavigation, isNavigationActive } from '@/lib/site-navigation';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  route.pathname = '/';
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

function findButton(scope: ParentNode, text: string) {
  return [...scope.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === text)!;
}

describe('consistent site navigation', () => {
  it.each(['default', 'landing'] as const)('%s header exposes the same desktop and mobile groups and destinations', async (variant) => {
    await act(async () => root.render(<Header variant={variant} />));
    const desktop = host.querySelector('nav[aria-label="주요 메뉴"]')!;
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="메뉴 열기"]')!.click());
    const mobile = host.querySelector('#mobile-site-navigation')!;

    for (const item of getSiteNavigation()) {
      if ('children' in item) {
        const desktopButton = findButton(desktop, item.label);
        const mobileButton = findButton(mobile, item.label);
        expect(desktopButton).toBeDefined();
        expect(mobileButton).toBeDefined();
        await act(async () => desktopButton.click());
        await act(async () => mobileButton.click());
        for (const child of item.children) {
          expect(desktop.querySelector(`a[href="${child.href}"]`)?.textContent).toContain(child.label);
          expect(mobile.querySelector(`a[href="${child.href}"]`)?.textContent).toContain(child.label);
        }
      } else {
        expect(desktop.querySelector(`a[href="${item.href}"]`)?.textContent).toBe(item.label);
        expect(mobile.querySelector(`a[href="${item.href}"]`)?.textContent).toBe(item.label);
      }
    }
    expect(host.querySelector('a[href="/blog"]')).toBeNull();
    if (variant === 'landing') expect(host.textContent).toContain('지역 둘러보기');
  });

  it('desktop click toggles a group and Escape restores keyboard focus', async () => {
    route.pathname = '/transactions';
    await act(async () => root.render(<Header />));
    const desktop = host.querySelector('nav[aria-label="주요 메뉴"]')!;
    const group = findButton(desktop, '부동산 분석');
    await act(async () => group.click());
    expect(group.getAttribute('aria-expanded')).toBe('true');
    const activeLink = desktop.querySelector<HTMLAnchorElement>('a[href="/transactions"]')!;
    expect(activeLink.getAttribute('aria-current')).toBe('page');
    await act(async () => {
      activeLink.focus();
      activeLink.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(group);
    await act(async () => group.click());
    await act(async () => group.click());
    expect(group.getAttribute('aria-expanded')).toBe('false');
  });

  it('mobile accordion has controlled panels, initial focus and Escape restoration', async () => {
    await act(async () => root.render(<Header variant="landing" />));
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="메뉴 열기"]')!;
    await act(async () => trigger.click());
    const panel = host.querySelector('#mobile-site-navigation')!;
    const group = findButton(panel, '부동산 분석');
    expect(document.activeElement).toBe(group);
    await act(async () => group.click());
    expect(group.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(group.getAttribute('aria-controls')!)).not.toBeNull();
    const link = panel.querySelector<HTMLAnchorElement>('a[href="/chart"]')!;
    await act(async () => {
      link.focus();
      link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('#mobile-site-navigation')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('changing route resets both open menus and marks the new destination', async () => {
    await act(async () => root.render(<Header />));
    await act(async () => findButton(host.querySelector('nav[aria-label="주요 메뉴"]')!, '부동산 분석').click());
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="메뉴 열기"]')!.click());
    route.pathname = '/subscription';
    await act(async () => root.render(<Header />));
    expect(host.querySelector('#mobile-site-navigation')).toBeNull();
    expect(host.querySelector('[id^="desktop-nav-group-"]')).toBeNull();
    expect(host.querySelector('a[href="/subscription"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('pointer outside closes menus without stealing the new focus', async () => {
    await act(async () => root.render(<Header />));
    await act(async () => findButton(host.querySelector('nav[aria-label="주요 메뉴"]')!, '시장 동향').click());
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('[id^="desktop-nav-group-"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="메뉴 열기"]')!.click());
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(host.querySelector('#mobile-site-navigation')).toBeNull();
  });

  it('quick-access labels reuse canonical links without changing their order', () => {
    expect(getMobileMoreNavigation().map((item) => item.href)).toEqual(['/highlights', '/location-map', '/market', '/loan', '/calendar']);
    expect(getMobileMoreNavigation().map((item) => item.label)).toContain('경제 달력');
    expect(isNavigationActive('/region', '/region/seoul')).toBe(true);
    expect(isNavigationActive('/region', '/regional')).toBe(false);
    expect(isNavigationActive('/', '/transactions')).toBe(false);
  });
});
