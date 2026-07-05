'use client';

import { useSyncExternalStore } from 'react';

// 구독 대상 없음 — 서버/클라이언트 스냅샷 차이(false → true)만 이용한다
const emptySubscribe = () => () => {};

/**
 * 하이드레이션 완료 여부.
 * 서버·하이드레이션 렌더에서는 false, 클라이언트 마운트 후에는 true.
 * effect 안 동기 setState 없이 마운트 플래그를 얻는 표준 패턴 (useSyncExternalStore).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
