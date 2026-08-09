/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONSENT_CHANGED_EVENT,
  CONSENT_STORAGE_KEY,
  clearGoogleAdvertisingCookies,
  clearGoogleAnalyticsCookies,
  getConsent,
  resetConsent,
  setConsent,
  trackAnalyticsEvent,
} from '../cookie-consent';

describe('cookie consent v2.1', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.dataLayer = [];
    delete window.gtag;
    document.cookie = '_ga=; Max-Age=0; path=/';
    document.cookie = '_ga_TEST=; Max-Age=0; path=/';
    document.cookie = '__gads=; Max-Age=0; path=/';
    document.cookie = '_gcl_au=; Max-Age=0; path=/';
    document.cookie = 'essential=; Max-Age=0; path=/';
  });

  it('광고 선택이 없는 v1 저장값은 승계하지 않는다', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      analytics: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: '1.0',
    }));

    expect(getConsent()).toBeNull();
  });

  it('분석·광고 선택을 저장하고 Consent Mode v2를 갱신한다', () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const changed = vi.fn();
    window.addEventListener(CONSENT_CHANGED_EVENT, changed, { once: true });

    const result = setConsent({ analytics: true, advertising: false, personalization: false });

    expect(result).toMatchObject({
      analytics: true,
      advertising: false,
      personalization: false,
      version: '2.1',
    });
    expect(getConsent()).toMatchObject({ analytics: true, advertising: false, personalization: false });
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    expect(changed).toHaveBeenCalledOnce();
  });

  it('광고와 맞춤형 광고 동의를 분리해 Consent Mode에 반영한다', () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    setConsent({ analytics: false, advertising: true, personalization: false });

    expect(gtag).toHaveBeenLastCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'denied',
    });
  });

  it('분석 동의 철회 시 GA 쿠키만 정리한다', () => {
    document.cookie = '_ga=visitor; path=/';
    document.cookie = '_ga_TEST=measurement; path=/';
    document.cookie = 'essential=keep; path=/';

    clearGoogleAnalyticsCookies();

    expect(document.cookie).not.toContain('_ga=');
    expect(document.cookie).not.toContain('_ga_TEST=');
    expect(document.cookie).toContain('essential=keep');
  });

  it('광고 동의 철회 시 접근 가능한 Google 광고 쿠키를 정리한다', () => {
    document.cookie = '__gads=ad-id; path=/';
    document.cookie = '_gcl_au=conversion-id; path=/';
    document.cookie = 'essential=keep; path=/';

    clearGoogleAdvertisingCookies();

    expect(document.cookie).not.toContain('__gads=');
    expect(document.cookie).not.toContain('_gcl_au=');
    expect(document.cookie).toContain('essential=keep');
  });

  it('전체 철회는 저장값과 GA 쿠키를 없애고 Consent Mode를 denied로 돌린다', () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    setConsent({ analytics: true, advertising: true, personalization: true });
    document.cookie = '_ga=visitor; path=/';
    gtag.mockClear();

    resetConsent();

    expect(getConsent()).toBeNull();
    expect(document.cookie).not.toContain('_ga=');
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  });

  it('분석 동의가 있을 때만 클릭 이벤트를 보낸다', () => {
    const gtag = vi.fn();
    window.gtag = gtag;

    trackAnalyticsEvent('telegram_click');
    expect(gtag).not.toHaveBeenCalled();

    setConsent({ analytics: true, advertising: false, personalization: false });
    gtag.mockClear();
    trackAnalyticsEvent('telegram_click', { placement: 'floating_button' });

    expect(gtag).toHaveBeenCalledWith('event', 'telegram_click', {
      placement: 'floating_button',
    });
  });
});
