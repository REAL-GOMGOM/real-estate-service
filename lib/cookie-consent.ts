/**
 * 쿠키 동의 관리
 *
 * 저장 위치: localStorage (쿠키 아님)
 * 저장 형식: JSON { analytics, advertising, personalization, updatedAt, version }
 */

export const CONSENT_STORAGE_KEY = 'naezip.cookie-consent';
export const CONSENT_CHANGED_EVENT = 'naezip:consent-changed';
export const COOKIE_SETTINGS_OPEN_EVENT = 'naezip:cookie-settings-open';
export const CURRENT_CONSENT_VERSION = '2.2';

export interface ConsentChoices {
  analytics: boolean;
  advertising: boolean;
  personalization: boolean;
}

export interface ConsentState extends ConsentChoices {
  updatedAt: string;
  version: typeof CURRENT_CONSENT_VERSION;
}

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

function isConsentState(value: unknown): value is ConsentState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConsentState>;
  return (
    candidate.version === CURRENT_CONSENT_VERSION &&
    typeof candidate.analytics === 'boolean' &&
    typeof candidate.advertising === 'boolean' &&
    typeof candidate.personalization === 'boolean' &&
    typeof candidate.updatedAt === 'string'
  );
}

/** 현재 동의 상태 조회. 미동의 또는 구버전이면 null. SSR에서는 항상 null. */
export function getConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isConsentState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** useSyncExternalStore에서 사용할 안정적인 원문 스냅샷. */
export function getConsentSnapshot(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function ensureGtag(): Gtag {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args));
  return window.gtag;
}

/** Google Consent Mode v2 상태를 즉시 갱신한다. */
export function updateGoogleConsentMode(consent: ConsentChoices): void {
  if (typeof window === 'undefined') return;
  const granted = (value: boolean) => (value ? 'granted' : 'denied');
  ensureGtag()('consent', 'update', {
    analytics_storage: granted(consent.analytics),
    ad_storage: granted(consent.advertising),
    ad_user_data: granted(consent.advertising),
    ad_personalization: granted(consent.advertising && consent.personalization),
  });
}

function clearFirstPartyCookies(matches: (name: string) => boolean): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const cookieNames = document.cookie
    .split(';')
    .map((cookie) => cookie.trim().split('=')[0])
    .filter(matches);

  const hostname = window.location.hostname;
  const domainCandidates = new Set<string>();
  if (hostname && hostname !== 'localhost') {
    domainCandidates.add(hostname);
    domainCandidates.add(`.${hostname}`);
    const labels = hostname.split('.');
    if (labels.length > 2) {
      const registrableDomain = labels.slice(-2).join('.');
      domainCandidates.add(registrableDomain);
      domainCandidates.add(`.${registrableDomain}`);
    }
  }

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    for (const domain of domainCandidates) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax`;
    }
  }
}

/** 브라우저에서 접근 가능한 Google Analytics 쿠키를 제거한다. */
export function clearGoogleAnalyticsCookies(): void {
  clearFirstPartyCookies((name) => name === '_ga' || name.startsWith('_ga_'));
}

/** 브라우저에서 접근 가능한 Google 광고 계열 1차 쿠키를 제거한다. */
export function clearGoogleAdvertisingCookies(): void {
  clearFirstPartyCookies((name) => (
    name === '__gads' ||
    name === '__gpi' ||
    name === '__eoi' ||
    name.startsWith('_gcl_') ||
    name.startsWith('_gac_')
  ));
}

/** 동의 상태 저장 및 각 태그에 즉시 반영. */
export function setConsent(choices: ConsentChoices): ConsentState | null {
  if (typeof window === 'undefined') return null;

  const state: ConsentState = {
    analytics: choices.analytics,
    advertising: choices.advertising,
    personalization: choices.advertising && choices.personalization,
    updatedAt: new Date().toISOString(),
    version: CURRENT_CONSENT_VERSION,
  };

  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    return null;
  }

  updateGoogleConsentMode(state);
  if (!state.analytics) clearGoogleAnalyticsCookies();
  if (!state.advertising || !state.personalization) clearGoogleAdvertisingCookies();
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: state }));
  return state;
}

/** 동의 기록을 초기화하고 모든 선택 항목을 다시 기본 거부로 돌린다. */
export function resetConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // 저장소 접근 실패와 무관하게 현재 페이지의 동의 상태는 철회한다.
  }
  updateGoogleConsentMode({ analytics: false, advertising: false, personalization: false });
  clearGoogleAnalyticsCookies();
  clearGoogleAdvertisingCookies();
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
}

/** 분석 동의가 있을 때만 GA 이벤트를 보낸다. */
export function trackAnalyticsEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
): void {
  if (typeof window === 'undefined' || getConsent()?.analytics !== true) return;
  ensureGtag()('event', eventName, params);
}
