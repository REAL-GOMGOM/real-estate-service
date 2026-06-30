'use client';

/**
 * Phase 8-2: blog 글 단위 ErrorBoundary (backstop).
 *
 * 격리 범위:
 * - 이 파일은 `app/blog/[slug]/error.tsx` segment error boundary
 * - 본 글 렌더 중 예외 발생 시 *이 글만* fallback UI로 격리
 * - 사이트 헤더/네비/푸터/다른 블로그 글·목록/카테고리는 영향 없음
 * - 루트 `app/error.tsx`(전역 fallback)와 명확히 역할 분리: 블로그 글 한 편의 깨짐은 여기서, 더 상위/타 segment 깨짐은 루트에서
 *
 * Phase 8-1(차트 12종 가드)이 1차 방어선이라 대부분의 잘못된 props는 이미 placeholder로 처리됨.
 * 이 boundary는 그 외 예외(예: 빌드 시 발견 못 한 MDX 컴파일 런타임 실패, sanitize 에지 케이스 등)에 대한 **backstop**.
 *
 * Next.js App Router 규칙:
 * - error.tsx는 반드시 'use client' (props로 받는 reset은 client 함수)
 * - error / reset 시그니처는 framework 지정
 */

export default function BlogPostError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // dev 환경에서는 콘솔에 원본 에러 노출 (작가 디버깅 보조)
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[blog/[slug]/error] 글 렌더 중 예외:', error);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h2 className="text-xl font-semibold text-slate-900 mb-3">
        이 글을 불러오는 중 문제가 발생했습니다
      </h2>
      <p className="text-sm text-slate-600 mb-6">
        일시적인 오류일 수 있습니다. 잠시 후 다시 시도해주세요.
        문제가 계속되면 다른 글을 둘러봐 주세요.
      </p>
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          다시 시도
        </button>
        <a
          href="/blog"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          글 목록으로
        </a>
      </div>
      {process.env.NODE_ENV !== 'production' && error?.digest && (
        <p className="mt-6 text-xs text-slate-400">
          digest: <code>{error.digest}</code>
        </p>
      )}
    </div>
  );
}
