import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';

/**
 * Auth.js v5 메인 설정 (Node-only).
 *
 * Credentials Provider — 단독 어드민 + 환경변수 기반.
 * - ADMIN_EMAIL: 평문 비교
 * - ADMIN_PASSWORD_HASH: bcryptjs 해시 (PR 2B에서 등록)
 *
 * 보안:
 * - 비밀번호는 절대 로그·에러 메시지에 노출 X
 * - bcrypt.compare는 timing-safe
 * - 이메일 불일치 시에도 bcrypt 호출하여 timing 균등화
 * - Rate limit은 PR 2C에서 추가
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) {
          return null;
        }

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

        if (!adminEmail || !adminPasswordHash) {
          console.error('[auth] ADMIN_EMAIL 또는 ADMIN_PASSWORD_HASH 미설정');
          return null;
        }

        // 이메일 불일치 — timing 균등 위해 bcrypt도 호출
        if (email.toLowerCase().trim() !== adminEmail.toLowerCase().trim()) {
          await bcrypt.compare(password, adminPasswordHash);
          return null;
        }

        const isValid = await bcrypt.compare(password, adminPasswordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: 'admin',
          email: adminEmail,
          name: 'Admin',
        };
      },
    }),
  ],
});
