import { ImageResponse } from 'next/og';
import { getPublishedPostBySlug } from '@/lib/blog/queries';
import { SITE_NAME } from '@/lib/site';

export const runtime = 'edge';
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
 * Google Fonts CSS API에서 woff2 URL 추출 후 폰트 데이터 fetch.
 *
 * text 파라미터로 사용된 글자만 포함된 subset 폰트 받기 — Edge 1MB 제한 회피.
 * 한국어 OG 이미지 표준 패턴 (Vercel docs).
 */
async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl, {
      headers: {
        // Google Fonts API는 User-Agent에 따라 woff2 vs woff 응답 다름
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    }).then((r) => r.text());

    const match = css.match(/url\(([^)]+\.woff2)\)/);
    if (!match) return null;

    const fontUrl = match[1];
    return await fetch(fontUrl).then((r) => r.arrayBuffer());
  } catch (e) {
    console.error('[og] font load failed:', e);
    return null;
  }
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

  const allText = `${title} ${categoryName} ${dateStr} ${SITE_NAME} ·`;
  const fontData = await loadKoreanFont(allText);

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
          fontFamily: fontData ? 'Noto Sans KR' : 'sans-serif',
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
      fonts: fontData
        ? [
            {
              name: 'Noto Sans KR',
              data: fontData,
              style: 'normal',
              weight: 700,
            },
          ]
        : [],
    },
  );
}
