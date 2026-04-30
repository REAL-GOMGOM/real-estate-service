'use client';

import dynamic from 'next/dynamic';
import { useState, useRef } from 'react';
import { upload } from '@vercel/blob/client';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

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
      const uploadOne = async (file: File) => {
        const yearMonth = new Date().toISOString().slice(0, 7);
        const timestamp = Date.now();
        const random = Math.random().toString(36).slice(2, 8);
        const ext = (file.name.split('.').pop() ?? 'bin')
          .toLowerCase()
          .slice(0, 5);
        const pathname = `blog/uploads/${yearMonth}/${timestamp}-${random}.${ext}`;

        const blob = await upload(pathname, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        });

        return blob.url;
      };

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
