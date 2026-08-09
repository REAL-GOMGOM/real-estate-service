import { describe, expect, it } from 'vitest';

import { getMacMiniSyncExitCode } from '../macmini-sync-health';

describe('getMacMiniSyncExitCode', () => {
  it('수집·로컬·Neon이 모두 정상일 때 0을 반환한다', () => {
    expect(getMacMiniSyncExitCode({
      localFailureCount: 0,
      neonFailureCount: 0,
      neonCircuitOpen: false,
    })).toBe(0);
  });

  it('로컬은 성공했지만 Neon 회로가 열리면 degraded 코드 2를 반환한다', () => {
    expect(getMacMiniSyncExitCode({
      localFailureCount: 0,
      neonFailureCount: 1,
      neonCircuitOpen: true,
    })).toBe(2);
  });

  it('회로가 닫혀도 Neon 쓰기 실패가 있으면 degraded 코드 2를 반환한다', () => {
    expect(getMacMiniSyncExitCode({
      localFailureCount: 0,
      neonFailureCount: 1,
      neonCircuitOpen: false,
    })).toBe(2);
  });

  it('로컬 실패는 Neon 상태보다 우선하는 실패 코드 1을 반환한다', () => {
    expect(getMacMiniSyncExitCode({
      localFailureCount: 1,
      neonFailureCount: 1,
      neonCircuitOpen: true,
    })).toBe(1);
  });
});
