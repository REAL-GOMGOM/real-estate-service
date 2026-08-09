import Link from 'next/link';

type BlogServiceUnavailableProps = {
  retryHref?: string;
  compact?: boolean;
};

export function BlogServiceUnavailable({
  retryHref = '/blog',
  compact = false,
}: BlogServiceUnavailableProps) {
  return (
    <div
      role="status"
      className={`rounded-xl border border-amber-200 bg-amber-50 text-center ${
        compact ? 'px-4 py-6' : 'px-6 py-12'
      }`}
    >
      <h2 className="text-base font-semibold text-slate-900">
        칼럼을 잠시 불러오지 못했습니다
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        데이터 연결이 일시적으로 원활하지 않습니다. 빈 목록으로 표시하지 않고
        복구 상태를 확인하고 있습니다.
      </p>
      <Link
        href={retryHref}
        className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        다시 시도
      </Link>
    </div>
  );
}
