'use client';

import { useActionState, useRef, useEffect } from 'react';
import { createCategory, type ActionState } from './actions';

/**
 * 카테고리 추가 폼.
 *
 * useActionState로 server action 결과 받기 → 에러/성공 메시지 표시.
 * 성공 시 form reset.
 */
export function CategoryCreateForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCategory,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && 'ok' in state && state.ok) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="slug" className="block text-xs font-medium text-slate-700">
            slug <span className="text-slate-400">(영문 소문��·숫자·하이픈)</span>
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            disabled={pending}
            placeholder="example-slug"
            pattern="^[a-z0-9-]{1,64}$"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-slate-700">
            이름
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            disabled={pending}
            maxLength={100}
            placeholder="예: 시장 동향"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
          />
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="description" className="block text-xs font-medium text-slate-700">
          설명 <span className="text-slate-400">(선택)</span>
        </label>
        <input
          id="description"
          name="description"
          type="text"
          disabled={pending}
          maxLength={500}
          placeholder="예: 가격, 거래량, 지역별 분석"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
        />
      </div>

      {state && 'error' in state && (
        <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state && 'ok' in state && state.ok && (
        <div role="status" className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          카테고리가 추가되었습니다.
        </div>
      )}

      <div className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? '추가 중...' : '추가'}
        </button>
      </div>
    </form>
  );
}
