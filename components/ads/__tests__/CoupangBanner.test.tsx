// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pathname: '/region/seoul',
  analytics: true,
  advertising: true,
}));
const trackAnalyticsEvent = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/hooks/useConsent', () => ({
  useConsent: () => ({
    analytics: state.analytics,
    advertising: state.advertising,
    personalization: false,
    updatedAt: '2026-08-27T00:00:00.000Z',
    version: '2.2',
  }),
}));
vi.mock('@/lib/cookie-consent', () => ({ trackAnalyticsEvent }));

import CoupangBanner from '../CoupangBanner';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function renderBanner(props: { variant?: 'footer' | 'inline'; subId?: string } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<CoupangBanner {...props} />);
    await Promise.resolve();
  });
  return host;
}

async function loadAdFrame() {
  const iframe = host?.querySelector('iframe');
  if (!iframe) throw new Error('ad iframe must render');
  await act(async () => {
    iframe.dispatchEvent(new Event('load'));
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  state.pathname = '/region/seoul';
  state.analytics = true;
  state.advertising = true;
  trackAnalyticsEvent.mockReset();
  vi.stubGlobal('IntersectionObserver', undefined);
  vi.stubGlobal('ResizeObserver', undefined);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

describe('CoupangBanner', () => {
  it('광고 동의 전에는 외부 위젯을 로드하지 않는다', async () => {
    state.advertising = false;
    const banner = await renderBanner({ variant: 'inline', subId: 'test' });
    expect(banner.querySelector('iframe')).toBeNull();
    expect(trackAnalyticsEvent).not.toHaveBeenCalled();
  });

  it('수수료 고지를 광고보다 먼저 명확하게 표시한다', async () => {
    const banner = await renderBanner({ variant: 'inline', subId: 'apt-detail-move' });
    const disclosure = banner.querySelector('p');
    const iframe = banner.querySelector('iframe');

    expect(disclosure?.textContent).toContain('쿠팡 파트너스 활동의 일환');
    expect(disclosure?.textContent).toContain('수수료를 제공받습니다');
    expect(iframe).not.toBeNull();
    if (!disclosure || !iframe) throw new Error('disclosure and iframe must render');
    expect(disclosure.compareDocumentPosition(iframe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('분석 동의가 있을 때 지면별 노출을 한 번 기록한다', async () => {
    await renderBanner({ variant: 'inline', subId: 'home-move' });
    expect(trackAnalyticsEvent).not.toHaveBeenCalled();
    await loadAdFrame();
    expect(trackAnalyticsEvent).toHaveBeenCalledTimes(1);
    expect(trackAnalyticsEvent).toHaveBeenCalledWith('coupang_ad_view', {
      placement: 'home-move',
      page_path: '/region/seoul',
    });
  });

  it('같은 배너가 다른 경로에서 다시 보이면 새 페이지 노출로 기록한다', async () => {
    await renderBanner({ subId: 'footer' });
    await loadAdFrame();
    state.pathname = '/market';
    await act(async () => {
      root!.render(<CoupangBanner subId="footer" />);
      await Promise.resolve();
    });

    expect(trackAnalyticsEvent).toHaveBeenCalledTimes(2);
    expect(trackAnalyticsEvent).toHaveBeenLastCalledWith('coupang_ad_view', {
      placement: 'footer',
      page_path: '/market',
    });
  });

  it('법적 안내 경로에서는 푸터 광고를 숨긴다', async () => {
    state.pathname = '/privacy';
    const banner = await renderBanner();
    expect(banner.querySelector('iframe')).toBeNull();
  });
});
