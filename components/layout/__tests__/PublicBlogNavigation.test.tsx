// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const features = vi.hoisted(() => ({ blog: false }));
vi.mock('@/lib/public-features', () => ({ isPublicBlogEnabled: () => features.blog }));
vi.mock('next/navigation', () => ({ usePathname: () => '/transactions' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('next/image', () => ({ default: () => null }));

import Header from '../Header';
import MobileNav from '@/components/landing/MobileNav';
import TelegramPage, { metadata as telegramMetadata } from '@/app/telegram/page';

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  features.blog = false;
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('public column pause navigation', () => {
  it.each([false, true])('common desktop/mobile header follows the public flag (%s)', async (enabled) => {
    features.blog = enabled;
    await act(async () => root!.render(<Header />));
    expect(host.querySelector('nav a[href="/blog"]') !== null).toBe(enabled);
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="메뉴 열기"]')!.click());
    expect(host.querySelector('#mobile-site-navigation a[href="/blog"]') !== null).toBe(enabled);
    expect(host.querySelector('a[href="/subscription"]')).not.toBeNull();
  });

  it.each([false, true])('home mobile menu follows the public flag (%s)', async (enabled) => {
    features.blog = enabled;
    await act(async () => root!.render(<MobileNav />));
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="메뉴 열기"]')!.click());
    expect(host.querySelector('a[href="/blog"]') !== null).toBe(enabled);
    await act(async () => host.querySelector<HTMLButtonElement>('#mobile-site-navigation button')!.click());
    expect(host.querySelector('a[href="/region"]')).not.toBeNull();
  });

  it('does not promote new columns on the Telegram landing or its metadata', async () => {
    await act(async () => root!.render(<TelegramPage />));
    expect(host.textContent).not.toContain('칼럼');
    expect(host.textContent).toContain('뉴스 브리핑');
    expect(host.textContent).toContain('실거래 다이제스트');
    expect(JSON.stringify(telegramMetadata)).not.toContain('칼럼');
  });
});
