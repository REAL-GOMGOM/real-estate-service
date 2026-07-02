/**
 * 사이클 U 리디자인: 딥네이비·로열블루 체계.
 *
 * 구 키(terracotta·sage·amber 등)는 사용처 166곳 호환을 위해 유지하고
 * 값만 신규 팔레트로 재매핑 — 이름과 색이 어긋나는 과도기 상태.
 * 신규 키(primary·success·ink 등)가 정식 명칭이며, 페이지별 리디자인 시
 * 구 키 사용처를 신규 키로 이전한다. 구 키 제거는 Phase 6(정리)에서.
 */
export const BRAND = {
  // ── 정식 키 (사이클 U) ──
  primary: '#1B4DDB',
  primaryText: '#1636A8',
  success: '#6FC08A',
  successText: '#2E7A4C',
  warning: '#EBC15C',
  surface: '#F6F8FC',
  surfaceDeep: '#EAEEF6',
  ink: '#14213D',
  inkSoft: '#48536B',
  line: '#E4E9F2',
  danger: '#E23B3B',

  // ── 구 키 (호환용 별칭 — Phase 6에서 제거 예정) ──
  terracotta: '#1B4DDB',
  terracottaText: '#1636A8',
  sage: '#6FC08A',
  sageText: '#2E7A4C',
  amber: '#EBC15C',
  bg: '#F6F8FC',
  paper: '#EAEEF6',
} as const;
