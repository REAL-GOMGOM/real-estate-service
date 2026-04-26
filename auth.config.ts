import type { NextAuthConfig } from 'next-auth';

/**
 * Auth.js v5 Edge-safe 설정.
 *
 * - providers는 빈 배열 (실제 Credentials Provider는 auth.ts에서 추가).
 *   이유: Edge runtime에서는 bcrypt 사용 불가.
 * - 페이지 redirect, 콜백 등 순수 설정만 여기에.
 *
 * Next.js 미들웨어/Edge 함수에서 import할 때 이 파일을 사용.
 */
export const authConfig = {
  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
  session: {
    strategy: 'jwt',
    // 30일 — 단독 어드민, 본인 노트북 가정
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    /**
     * 보호된 경로 접근 시 인증 검증.
     * /admin/* 경로는 로그인 필수.
     * 단, /admin/login은 비인증 접근 허용.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnAdmin = nextUrl.pathname.startsWith('/admin');
      const isOnLogin = nextUrl.pathname === '/admin/login';

      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL('/admin', nextUrl));
        }
        return true;
      }

      if (isOnAdmin) {
        return isLoggedIn;
      }

      return true;
    },

    /**
     * JWT에 사용자 정보 박기.
     */
    async jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.role = 'admin';
      }
      return token;
    },

    /**
     * 클라이언트에 노출할 세션 객체 구성.
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
