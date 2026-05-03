import { auth } from '@/auth';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

import { getClientIdentifier, getUploadRatelimit } from '@/lib/auth/rate-limit';

// 4MB — Vercel Serverless Function body 한도(4.5MB) 회피
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

// multipart 오버헤드 여유분 (헤더 단계에서 파일+oversize 거름)
const MULTIPART_OVERHEAD_BYTES = 1024;

// MIME 화이트리스트 → 확장자 역산 (file.name 신뢰 X, 확장자 위조 방지)
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// CDN/브라우저 캐시 1년 — pathname에 timestamp+random 박혀 immutable
const CACHE_CONTROL_MAX_AGE_SECONDS = 31_536_000;

// 충돌 방지 random 길이 (16^12 ≈ 2.8×10¹⁴)
const RANDOM_SUFFIX_LENGTH = 12;

// pathname prefix
const UPLOAD_PATH_PREFIX = 'blog/uploads';

function buildErrorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

function generateRandomSuffix(length: number): string {
  // crypto.randomUUID 기반 — Math.random 대비 충돌·예측 안전
  return crypto.randomUUID().replace(/-/g, '').slice(0, length);
}

export async function POST(request: Request) {
  // [1] Origin 검증 — cross-site POST 차단
  // 같은 origin fetch는 Origin 헤더 자동 부착, curl 등 외부 호출은 미부착
  const origin = request.headers.get('origin');
  const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.naezipkorea.com';
  if (origin && origin !== allowedOrigin) {
    return buildErrorResponse('forbidden', 403);
  }

  // [2] 인증 — admin 단독 모델 (기존 requireAdmin 패턴 일치)
  const session = await auth();
  if (!session?.user?.email) {
    return buildErrorResponse('unauthorized', 401);
  }

  // [3] Content-Length 사전 거부 — DoS 방어
  // FormData 파싱이 메모리에 다 올리기 전에 헤더 단계에서 차단
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_FILE_SIZE_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return buildErrorResponse('too_large', 413);
    }
  }

  // [4] Rate limit — fail-open (Upstash 장애 시 통과, 기존 auth.ts 패턴 일치)
  try {
    const ip = getClientIdentifier(request.headers);
    // key: email:ip — 동일 admin이라도 IP별 분리 추적
    const rateLimitKey = `${session.user.email}:${ip}`;
    const { success } = await getUploadRatelimit().limit(rateLimitKey);
    if (!success) {
      return buildErrorResponse('rate_limited', 429);
    }
  } catch (e) {
    console.error('[upload] rate limit error (fail-open):', e);
  }

  // [5] FormData 파싱
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return buildErrorResponse('no_file', 400);
  }
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return buildErrorResponse('no_file', 400);
  }

  // [6] 빈 파일 거부
  if (file.size === 0) {
    return buildErrorResponse('no_file', 400);
  }

  // [7] 사이즈 검증 (헤더 통과 후 실제 파일 사이즈 재확인)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return buildErrorResponse('too_large', 413);
  }

  // [8] MIME 화이트리스트
  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return buildErrorResponse('invalid_type', 415);
  }

  // [9] pathname 생성 — blog/uploads/{yyyy-MM}/{ts}-{random12}.{ext}
  const yearMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const timestamp = Date.now();
  const randomSuffix = generateRandomSuffix(RANDOM_SUFFIX_LENGTH);
  const pathname = `${UPLOAD_PATH_PREFIX}/${yearMonth}/${timestamp}-${randomSuffix}.${ext}`;

  // [10] put() — server-side 업로드
  try {
    const blob = await put(pathname, file, {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,            // 우리가 직접 random 12자 부착
      allowOverwrite: false,             // 충돌 시 에러 (orphan/덮어쓰기 방지)
      cacheControlMaxAge: CACHE_CONTROL_MAX_AGE_SECONDS,
    });
    return NextResponse.json({ url: blob.url });
  } catch (e) {
    console.error('[upload] put failed:', e);
    return buildErrorResponse('upload_failed', 500);
  }
}
