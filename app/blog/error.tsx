'use client';

import Link from 'next/link';

export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[blog/error] 칼럼 화면 렌더 오류:', error);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-xl font-semibold text-slate-900">
        칼럼을 잠시 불러오지 못했습니다
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        일시적인 오류일 수 있습니다. 다른 서비스는 계속 이용할 수 있습니다.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
