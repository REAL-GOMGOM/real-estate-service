import Link from 'next/link';

/**
 * 페이지네이션.
 *
 * 단순 < 이전 / 다음 > 형태.
 * baseHref에 query string ?page=N 자동 추가.
 */
export function Pagination({
  page,
  totalPages,
  baseHref,
}: {
  page: number;
  totalPages: number;
  baseHref: string;
}) {
  if (totalPages <= 1) return null;

  const prevHref = page > 1 ? buildHref(baseHref, page - 1) : null;
  const nextHref = page < totalPages ? buildHref(baseHref, page + 1) : null;

  return (
    <div className="flex items-center justify-center gap-3">
      {prevHref ? (
        <Link
          href={prevHref}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          ← 이전
        </Link>
      ) : (
        <span className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-300">
          ← 이전
        </span>
      )}

      <span className="text-sm text-slate-500">
        {page} / {totalPages}
      </span>

      {nextHref ? (
        <Link
          href={nextHref}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          다음 →
        </Link>
      ) : (
        <span className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-300">
          다음 →
        </span>
      )}
    </div>
  );
}

function buildHref(base: string, page: number): string {
  if (page <= 1) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}page=${page}`;
}
