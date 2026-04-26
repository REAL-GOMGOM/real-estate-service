'use client';

import dynamic from 'next/dynamic';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

/**
 * MDX 에디터 wrapper.
 *
 * @uiw/react-md-editor는 SSR 비호환 (window 의존).
 * dynamic import + ssr:false로 client에서만 로드.
 */
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded border border-slate-300 bg-slate-50 text-sm text-slate-500">
      에디터 로딩…
    </div>
  ),
});

export function MDXEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div data-color-mode="light">
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={500}
        preview="live"
        textareaProps={{
          placeholder: '마크다운 또는 MDX로 본문을 작성하세요...',
        }}
      />
    </div>
  );
}
