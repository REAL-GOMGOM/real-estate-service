import { ImageResponse } from 'next/og';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getPublishedPostBySlug } from '@/lib/blog/queries';
import { SITE_NAME } from '@/lib/site';

export const alt = '내집(My.ZIP) 칼럼';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const KST_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Seoul',
};

/**
 * Pretendard-Bold OTF 디스크 read.
 *
 * region OG (app/region/[id]/opengraph-image.tsx)와 동일 패턴.
 * Node runtime 전용 (Edge에서는 fs 사용 불가).
 */
async function loadPretendard(): Promise<ArrayBuffer> {
  const fontPath = path.join(
    process.cwd(),
    'public/fonts/Pretendard-Bold.otf',
  );
  const fontBuffer = await fs.readFile(fontPath);
  return fontBuffer.buffer.slice(
    fontBuffer.byteOffset,
    fontBuffer.byteOffset + fontBuffer.byteLength,
  );
}

type ImageParams = Promise<{ slug: string }>;

export default async function OpengraphImage({ params }: { params: ImageParams }) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  // 글 없을 때 fallback
  const title = post?.title ?? '내집(My.ZIP) 칼럼';
  const categoryName = post?.categoryName ?? '';
  const dateStr = post?.publishedAt
    ? new Intl.DateTimeFormat('ko-KR', KST_DATE_FORMAT).format(post.publishedAt)
    : '';

  const fontData = await loadPretendard();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#f8fafc',
          backgroundImage:
            'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
          padding: '80px',
          fontFamily: 'Pretendard',
        }}
      >
        <div style={{ display: 'flex' }}>
          {categoryName && (
            <div
              style={{
                padding: '8px 20px',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                borderRadius: '999px',
                fontSize: '28px',
                fontWeight: 700,
                display: 'flex',
              }}
            >
              {categoryName}
            </div>
          )}
        </div>

        <div
          style={{
            fontSize: title.length > 30 ? '60px' : '76px',
            fontWeight: 700,
            color: '#0f172a',
            lineHeight: 1.25,
            display: 'flex',
            // 너무 길면 잘림
            maxHeight: '380px',
            overflow: 'hidden',
          }}
        >
          {title}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '28px',
            color: '#475569',
          }}
        >
          <div style={{ display: 'flex' }}>{dateStr}</div>
          <div style={{ display: 'flex', fontWeight: 700, color: '#0f172a' }}>
            {SITE_NAME}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Pretendard',
          data: fontData,
          style: 'normal',
          weight: 700,
        },
      ],
    },
  );
}
