import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

/**
 * Vercel Blob 클라이언트 업로드용 토큰 발급 엔드포인트.
 *
 * @vercel/blob/client의 upload() 함수가 두 단계로 호출:
 * 1. POST /api/upload (token 요청) — 이 함수가 처리
 * 2. PUT https://blob.vercel-storage.com/... (실제 데이터, client 직접)
 *
 * 보안:
 * - onBeforeGenerateToken에서 어드민 세션 검증
 * - 미인증 시 throw → 401 응답
 * - allowedContentTypes로 MIME 화이트리스트
 * - maximumSizeInBytes로 5MB 제한
 *
 * 용도: 어드민 글 작성·수정 페이지에서 이미지 업로드.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // 어드민 세션 검증
        const session = await auth();
        if (!session?.user?.email) {
          throw new Error('Unauthorized');
        }

        return {
          allowedContentTypes: [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
          ],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5MB
          // 필요 시 onUploadCompleted에서 토큰 페이로드 활용
          tokenPayload: JSON.stringify({
            userEmail: session.user.email,
            uploadedAt: new Date().toISOString(),
          }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // 업로드 완료 후 추가 처리 필요 시 여기에
        // (예: DB에 첨부 이미지 기록)
        // PR 5에서는 로그만, 글의 mdxContent·coverImageUrl 필드에
        // URL이 박히는 것으로 충분
        console.log('[upload] completed', {
          url: blob.url,
          pathname: blob.pathname,
        });
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Upload failed';
    const status = message === 'Unauthorized' ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
