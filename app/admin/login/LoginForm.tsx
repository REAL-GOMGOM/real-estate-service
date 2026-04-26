'use client';

import { useState, useTransition } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

/**
 * 로그인 폼 (Client Component).
 *
 * 보안:
 * - 에러 메시지 일반화 ("이메일 또는 비밀번호가 올바르지 않습니다")
 * - 비밀번호 type="password"
 * - Auth.js CSRF 토큰 (signIn 내부 처리)
 */
type Props = {
  errorParam?: string;
  callbackUrl: string;
};

export function LoginForm({ errorParam, callbackUrl }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(
    errorParam ? '이메일 또는 비밀번호가 올바르지 않습니다.' : null,
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
          callbackUrl,
        });

        if (!result || result.error) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
          return;
        }

        router.push(callbackUrl);
        router.refresh();
      } catch {
        setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      autoComplete="off"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            disabled={isPending}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="flex w-full items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? '로그인 중...' : '로그인'}
        </button>
      </div>
    </form>
  );
}
