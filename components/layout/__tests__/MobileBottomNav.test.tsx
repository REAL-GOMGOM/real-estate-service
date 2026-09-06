// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
}));

vi.mock('next/link', async () => {
  const { forwardRef } = await import('react');
  return {
    default: forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
      function LinkMock({ href, children, ...props }, ref) {
        return <a ref={ref} href={href} {...props}>{children}</a>;
      },
    ),
  };
});

import MobileBottomNav, { shouldShowMobileBottomNav } from '../MobileBottomNav';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderNavigation(pathname: string) {
  route.pathname = pathname;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MobileBottomNav />);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  return host;
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('MobileBottomNav', () => {
  it('현재 경로를 표시하는 5개 전역 탭과 콘텐츠 보호 여백을 렌더링한다', async () => {
    const page = await renderNavigation('/transactions');
    const nav = page.querySelector('nav[aria-label="모바일 하단 메뉴"]')!;

    expect(nav.textContent).toContain('홈');
    expect(nav.textContent).toContain('실거래');
    expect(nav.textContent).toContain('지역');
    expect(nav.textContent).toContain('청약');
    expect(nav.textContent).toContain('더보기');
    expect(nav.querySelector('a[href="/transactions"]')?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelector('a[href="/"]')?.hasAttribute('aria-current')).toBe(false);
    expect(page.querySelector('.nz-mobile-bottom-nav-spacer')).not.toBeNull();
  });

  it('더보기 안에 포커스를 유지하고 Escape와 backdrop 닫기 뒤 버튼으로 돌린다', async () => {
    const page = await renderNavigation('/transactions');
    const moreButton = [...page.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '더보기')!;

    await act(async () => {
      moreButton.click();
      await Promise.resolve();
    });

    const moreNav = page.querySelector('nav[aria-label="추가 메뉴"]')!;
    const links = [...moreNav.querySelectorAll('a')];
    const firstLink = links[0];
    const lastLink = links[links.length - 1];
    const backdrop = page.querySelector<HTMLButtonElement>('.nz-mobile-bottom-nav-backdrop')!;
    expect(moreButton.getAttribute('aria-expanded')).toBe('true');
    expect(moreNav.textContent).toContain('주요 거래');
    expect(moreNav.textContent).toContain('대출 계산기');
    expect(moreNav.querySelector('a[href="/blog"]')).toBeNull();
    expect(moreNav.textContent).not.toContain('칼럼');
    expect(document.activeElement).toBe(firstLink);
    expect(backdrop.tabIndex).toBe(-1);

    await act(async () => {
      firstLink.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(lastLink);

    await act(async () => {
      lastLink.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(firstLink);

    await act(async () => {
      firstLink.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(page.querySelector('nav[aria-label="추가 메뉴"]')).toBeNull();
    expect(moreButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(moreButton);

    await act(async () => {
      moreButton.click();
      await Promise.resolve();
    });
    const reopenedBackdrop = page.querySelector<HTMLButtonElement>('.nz-mobile-bottom-nav-backdrop')!;
    await act(async () => reopenedBackdrop.click());
    expect(page.querySelector('nav[aria-label="추가 메뉴"]')).toBeNull();
    expect(document.activeElement).toBe(moreButton);
  });

  it('관리자와 비공개 미리보기 경로에서는 내비와 여백을 모두 제외한다', async () => {
    expect(shouldShowMobileBottomNav('/admin/login')).toBe(false);
    expect(shouldShowMobileBottomNav('/preview/example')).toBe(false);
    expect(shouldShowMobileBottomNav('/transactions')).toBe(true);

    const page = await renderNavigation('/admin/login');
    expect(page.innerHTML).toBe('');
  });
});
