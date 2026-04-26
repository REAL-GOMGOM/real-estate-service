'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Category } from '@/lib/db/schema';

/**
 * 글 목록 필터 (상태 + 카테고리).
 *
 * URL searchParams를 갱신하여 서버 컴포넌트 재렌더 트리거.
 * 선택 변경 시 router.push → page.tsx의 Suspense가 새 데이터 fetch.
 */
interface Props {
  categories: Category[];
}

export function PostFilters({ categories }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStatus = searchParams.get('status') ?? 'all';
  const currentCategory = searchParams.get('category') ?? 'all';

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/admin/posts?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={currentStatus}
        onChange={(e) => update('status', e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      >
        <option value="all">전체 상태</option>
        <option value="draft">임시저장</option>
        <option value="published">발행됨</option>
      </select>

      <select
        value={currentCategory}
        onChange={(e) => update('category', e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      >
        <option value="all">전체 카테고리</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
