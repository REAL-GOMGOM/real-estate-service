'use client';

import dynamic from 'next/dynamic';
import { useState, useRef } from 'react';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { mdxSanitizeSchema } from '@/lib/mdx/sanitize-schema';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

// 서버 응답 에러 코드 → 사용자 표시 메시지
const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: '로그인이 만료되었습니다. 다시 로그인해주세요',
  forbidden: '권한이 없습니다',
  rate_limited: '업로드 빈도가 너무 높습니다. 잠시 후 다시 시도해주세요',
  no_file: '파일이 선택되지 않았습니다',
  too_large: '4MB 이하 이미지만 업로드 가능합니다',
  invalid_type: 'JPG, PNG, WebP, GIF 형식만 허용됩니다',
  upload_failed: '업로드 실패. 잠시 후 다시 시도해주세요',
};

const FALLBACK_UPLOAD_ERROR = UPLOAD_ERROR_MESSAGES.upload_failed;

/**
 * MDX 에디터 wrapper.
 *
 * @uiw/react-md-editor는 SSR 비호환 (window 의존).
 * dynamic import + ssr:false로 client에서만 로드.
 *
 * 이미지 업로드 통합:
 * - paste (Cmd+V): 클립보드의 이미지 자동 업로드 + 본문 끝에 ![](url)
 * - drag & drop: 동일
 *
 * 업로드는 @vercel/blob/client direct upload.
 * /api/upload에서 어드민 검증 + 5MB·이미지 MIME 화이트리스트.
 *
 * cursor 위치 정확 삽입은 백로그 — 현재는 본문 끝에 append.
 */
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 items-center justify-center rounded border border-slate-300 bg-slate-50 text-sm text-slate-500">
      에디터 로딩…
    </div>
  ),
});

const ACCEPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function MDXEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * 파일 업로드 후 마크다운 이미지 마크업을 본문 끝에 append.
   * 여러 파일 동시 업로드 가능 (병렬).
   */
  const uploadFiles = async (files: File[]) => {
    const images = files.filter(
      (f) => f.size <= MAX_SIZE && ACCEPT_MIME.includes(f.type),
    );
    if (images.length === 0) {
      setError('업로드 가능한 이미지가 없습니다 (JPEG/PNG/WebP/GIF, 5MB 이하)');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      // 단일 파일을 server-side /api/upload에 보내고 url 반환
      // 실패 시 사용자 표시 메시지를 담은 Error throw → 호출부 Promise.all이 reject로 전파
      async function uploadOne(file: File): Promise<string> {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const { error: code } = await res
            .json()
            .catch(() => ({ error: 'upload_failed' }));
          const message =
            UPLOAD_ERROR_MESSAGES[code as string] ?? FALLBACK_UPLOAD_ERROR;
          throw new Error(message);
        }

        const { url } = (await res.json()) as { url: string };
        return url;
      }

      const urls = await Promise.all(images.map(uploadOne));
      const insertion = urls.map((url) => `\n![](${url})\n`).join('');
      onChange(value + insertion);
    } catch (e) {
      console.error('[mdx.upload] error:', e);
      setError(
        e instanceof Error ? e.message : '업로드 중 오류가 발생했습니다',
      );
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      await uploadFiles(files);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    const files = Array.from(e.dataTransfer.files ?? []);
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length > 0) {
      e.preventDefault();
      await uploadFiles(images);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        data-color-mode="light"
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <MDEditor
          value={value}
          onChange={(v) => onChange(v ?? '')}
          height={500}
          preview="live"
          previewOptions={{
            // 미리보기는 react-markdown 기반 — raw HTML 처리에 rehype-raw 필요
            // (발행 렌더러는 MDX native라 rehype-raw 미사용)
            remarkPlugins: [remarkGfm],
            rehypePlugins: [rehypeRaw, [rehypeSanitize, mdxSanitizeSchema]],
          }}
          textareaProps={{
            placeholder:
              '마크다운 또는 MDX로 본문을 작성하세요... (이미지 paste·drop 가능)',
          }}
        />
      </div>

      {uploading && (
        <p className="text-xs text-slate-500">이미지 업로드 중…</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
