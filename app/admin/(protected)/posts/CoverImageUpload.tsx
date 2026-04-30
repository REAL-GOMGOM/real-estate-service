'use client';

import { useState, useRef } from 'react';
import { upload } from '@vercel/blob/client';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * 커버 이미지 업로드 + 미리보기.
 *
 * value (현재 URL) / onChange (URL 또는 null) controlled.
 * Client direct upload via @vercel/blob/client.
 *
 * 흐름:
 * 1. 파일 선택 → 클라이언트 검증 (size, type)
 * 2. /api/upload에 토큰 요청 → 검증 후 토큰 발급
 * 3. Vercel Blob에 직접 업로드 → URL 받음
 * 4. onChange(url) 호출 → 부모 폼 state 갱신
 */
export function CoverImageUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);

    // 클라이언트 검증
    if (file.size > MAX_SIZE) {
      setError(`파일이 너무 큽니다 (최대 ${MAX_SIZE / 1024 / 1024}MB)`);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다');
      return;
    }

    setUploading(true);
    try {
      const safeName = sanitizeFileName(file.name);
      const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const pathname = `blog/uploads/${yearMonth}/${safeName}`;

      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });

      onChange(blob.url);
    } catch (e) {
      console.error('[cover.upload] error:', e);
      setError(
        e instanceof Error ? e.message : '업로드 중 오류가 발생했습니다',
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = () => {
    onChange(null);
    setError(null);
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="커버 이미지 미리보기"
            className="h-40 w-auto rounded-md border border-slate-200 object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            disabled={uploading}
            className="absolute right-1 top-1 rounded-md bg-slate-900/80 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
          >
            제거
          </button>
        </div>
      ) : (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-slate-400">
            JPEG, PNG, WebP, GIF · 최대 5MB
          </p>
        </div>
      )}

      {uploading && (
        <p className="text-xs text-slate-500">업로드 중…</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * 파일명 sanitize.
 * - 충돌 방지를 위해 timestamp + random 6자리 + 확장자만 유지
 */
function sanitizeFileName(name: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const ext = (name.split('.').pop() ?? 'bin').toLowerCase().slice(0, 5);
  return `${timestamp}-${random}.${ext}`;
}
