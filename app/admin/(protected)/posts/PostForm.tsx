'use client';

import { useActionState, useState } from 'react';
import { createPost, updatePost, type ActionState } from './actions';
import { MDXEditor } from './MDXEditor';
import { CoverImageUpload } from './CoverImageUpload';

type Category = {
  id: string;
  slug: string;
  name: string;
};

type PostData = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  mdxContent: string;
  coverImageUrl: string | null;
  categoryId: string | null;
  status: 'draft' | 'published';
};

type Props =
  | { mode: 'create'; categories: Category[] }
  | { mode: 'edit'; post: PostData; categories: Category[] };

/**
 * 글 작성·수정 통합 폼.
 *
 * mode='create': 빈 폼 → createPost
 * mode='edit': 기존 값 채움 + id hidden → updatePost
 *
 * 본문(mdxContent)은 MDXEditor 외부 상태로 관리하고 hidden input으로 form에 포함.
 *
 * 액션 버튼:
 * - [임시저장] intent='save'
 * - [발행]    intent='publish'
 */
export function PostForm(props: Props) {
  const action = props.mode === 'create' ? createPost : updatePost;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  const initial = props.mode === 'edit' ? props.post : null;

  const [mdxContent, setMdxContent] = useState(initial?.mdxContent ?? '');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(
    initial?.coverImageUrl ?? null,
  );

  return (
    <form action={formAction} className="space-y-6">
      {props.mode === 'edit' && (
        <input type="hidden" name="id" value={props.post.id} />
      )}
      <input type="hidden" name="mdxContent" value={mdxContent} />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">메타정보</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="title" className="block text-xs font-medium text-slate-700">
              제목 *
            </label>
            <input
              id="title"
              name="title"
              type="text"
              required
              defaultValue={initial?.title ?? ''}
              maxLength={200}
              disabled={pending}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-xs font-medium text-slate-700">
              slug * <span className="text-slate-400">(영문 소문자·숫자·하이픈)</span>
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              defaultValue={initial?.slug ?? ''}
              pattern="[a-z0-9-]+"
              maxLength={200}
              disabled={pending}
              placeholder="예: gangnam-subscription-guide"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="categoryId" className="block text-xs font-medium text-slate-700">
              카테고리
            </label>
            <select
              id="categoryId"
              name="categoryId"
              defaultValue={initial?.categoryId ?? ''}
              disabled={pending}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
            >
              <option value="">(없음)</option>
              {props.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="excerpt" className="block text-xs font-medium text-slate-700">
              요약 <span className="text-slate-400">(선택, SEO description, 0~300자)</span>
            </label>
            <textarea
              id="excerpt"
              name="excerpt"
              rows={2}
              defaultValue={initial?.excerpt ?? ''}
              maxLength={300}
              disabled={pending}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700">
              커버 이미지 <span className="text-slate-400">(선택)</span>
            </label>
            <input
              type="hidden"
              name="coverImageUrl"
              value={coverImageUrl ?? ''}
            />
            <div className="mt-1">
              <CoverImageUpload
                value={coverImageUrl}
                onChange={setCoverImageUrl}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">본문 (Markdown / MDX)</h2>
        <div className="mt-3">
          <MDXEditor value={mdxContent} onChange={setMdxContent} />
        </div>
      </div>

      {state && 'error' in state && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state && 'ok' in state && state.ok && (
        <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          저장되었습니다.
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? '저장 중...' : '임시저장'}
        </button>
        <button
          type="submit"
          name="intent"
          value="publish"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? '발행 중...' : '발행'}
        </button>
      </div>
    </form>
  );
}
