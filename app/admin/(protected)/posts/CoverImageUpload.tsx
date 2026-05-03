'use client';

import { useState, useRef } from 'react';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

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

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
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
        setError(message);
        return;
      }

      const { url } = (await res.json()) as { url: string };
      onChange(url);
    } catch (e) {
      console.error('[CoverImageUpload] upload failed:', e);
      setError(FALLBACK_UPLOAD_ERROR);
    } finally {
      setUploading(false);
    }
  }

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

