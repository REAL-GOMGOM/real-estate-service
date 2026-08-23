export type MacMiniSyncExitCode = 0 | 1 | 2;

interface MacMiniSyncHealth {
  localFailureCount: number;
  neonFailureCount: number;
  neonCircuitOpen: boolean;
}

/**
 * 0: 전체 정상, 1: 수집/로컬 원장 실패, 2: 로컬 원장은 유지됐지만 Neon 서빙 캐시가 저하됨.
 */
export function getMacMiniSyncExitCode({
  localFailureCount,
  neonFailureCount,
  neonCircuitOpen,
}: MacMiniSyncHealth): MacMiniSyncExitCode {
  if (localFailureCount > 0) return 1;
  if (neonFailureCount > 0 || neonCircuitOpen) return 2;
  return 0;
}
