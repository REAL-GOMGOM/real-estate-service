import { handlers } from '@/auth';

/**
 * Auth.js v5 API 라우트 — 표준 핸들러 export.
 * /api/auth/* 모든 요청 (signin, signout, session, csrf 등) 처리.
 */
export const { GET, POST } = handlers;
