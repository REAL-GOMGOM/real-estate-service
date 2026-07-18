/**
 * 실거래 조회 소스 flag — Phase 2 롤아웃 공용 (매매·전월세 라우트 공유).
 *   'live'   국토부 실시간 프록시 (기본 — 미설정 시 회귀 0)
 *   'db'     자체 원장 조회 (미적재·실패 시 호출부가 live 폴백)
 *   'shadow' 응답은 live, 매매 라우트만 db 건수를 비교 로깅 (검증용)
 */
export type TxSource = 'live' | 'db' | 'shadow';

export function txSource(): TxSource {
  const v = process.env.TRANSACTIONS_SOURCE;
  return v === 'db' || v === 'shadow' ? v : 'live';
}
