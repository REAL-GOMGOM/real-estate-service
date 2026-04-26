'use server';

import { signOut } from '@/auth';

/**
 * 어드민 로그아웃 Server Action.
 *
 * Auth.js v5의 signOut 호출 → 세션 쿠키 삭제 → /admin/login으로 redirect.
 * form action 사용 (CSRF 자동 + JS 비활성 progressive enhancement).
 */
export async function logoutAction() {
  await signOut({ redirectTo: '/admin/login' });
}
