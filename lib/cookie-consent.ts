/**
 * 쿠키 동의 관리 — Phase 5d-2
 *
 * 저장 위치: localStorage (쿠키 아님)
 * 저장 형식: JSON { analytics: boolean, updatedAt: ISO8601, version: string }
 */

const STORAGE_KEY = 'naezip.cookie-consent';
const CURRENT_VERSION = '1.0';

export interface ConsentState {
  analytics: boolean;
  updatedAt: string;
  version: string;
}

/** 현재 동의 상태 조회. 미동의 또는 구버전이면 null. SSR에서는 항상 null. */
export function getConsent(): ConsentState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 동의 상태 저장. */
export function setConsent(analytics: boolean): void {
  if (typeof window === 'undefined') return;
  const state: ConsentState = {
    analytics,
    updatedAt: new Date().toISOString(),
    version: CURRENT_VERSION,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('naezip:consent-changed'));
  } catch {
    // localStorage 쓰기 실패는 무시
  }
}

/** 동의 상태 초기화 (쿠키 설정 재오픈용). */
export function resetConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('naezip:consent-changed'));
  } catch {
    // 무시
  }
}
