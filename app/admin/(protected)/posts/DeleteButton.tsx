'use client';

import { deletePostAction } from './actions';

/**
 * 글 삭제 버튼.
 *
 * confirm dialog로 2단계 확인 후 Server Action 호출.
 * form action={fn.bind(null, id)} 패턴.
 */
export function DeleteButton({ id, title }: { id: string; title: string }) {
  const boundAction = deletePostAction.bind(null, id);

  return (
    <form
      action={boundAction}
      onSubmit={(e) => {
        if (!confirm(`"${title}" 글을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
          e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="text-xs text-red-600 hover:text-red-800 transition-colors"
      >
        삭제
      </button>
    </form>
  );
}
