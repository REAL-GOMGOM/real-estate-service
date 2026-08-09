'use client';

import { useMemo, useSyncExternalStore } from 'react';
import {
  CONSENT_CHANGED_EVENT,
  getConsent,
  getConsentSnapshot,
  type ConsentState,
} from '@/lib/cookie-consent';

function subscribe(onStoreChange: () => void) {
  window.addEventListener(CONSENT_CHANGED_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/** 같은 탭의 커스텀 이벤트와 다른 탭의 storage 이벤트를 모두 반영한다. */
export function useConsent(): ConsentState | null {
  const snapshot = useSyncExternalStore(subscribe, getConsentSnapshot, () => '');
  return useMemo(() => (snapshot ? getConsent() : null), [snapshot]);
}
