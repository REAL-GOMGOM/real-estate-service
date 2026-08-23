import { ImageResponse } from 'next/og';
import fs from 'node:fs/promises';
import path from 'node:path';

export const alt = '내집(My.ZIP) — 부동산의 모든 답을 한곳에';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadPretendard(): Promise<ArrayBuffer> {
  const fontBuffer = await fs.readFile(
    path.join(process.cwd(), 'public/fonts/Pretendard-Bold.otf'),
  );
  return fontBuffer.buffer.slice(
    fontBuffer.byteOffset,
    fontBuffer.byteOffset + fontBuffer.byteLength,
  );
}

export default async function OpenGraphImage() {
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
          padding: '72px 80px',
          color: '#ffffff',
          background:
            'linear-gradient(135deg, #0b1f4d 0%, #1b4ddb 58%, #4976ee 100%)',
          fontFamily: 'Pretendard',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '18px',
              background: '#ffffff',
              color: '#1b4ddb',
              fontSize: '34px',
              fontWeight: 800,
            }}
          >
            집
          </div>
          <div style={{ display: 'flex', fontSize: '34px', fontWeight: 700 }}>
            내집 My.ZIP
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                fontSize: '68px',
                lineHeight: 1.15,
                letterSpacing: '-2px',
                fontWeight: 800,
              }}
            >
              부동산의 모든 답을,
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: '68px',
                lineHeight: 1.15,
                letterSpacing: '-2px',
                fontWeight: 800,
              }}
            >
              한 곳에 압축하다
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '28px',
              fontSize: '27px',
              color: '#dce6ff',
            }}
          >
            실거래 · 입지 분석 · 청약 · 내집마련 도구
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Pretendard', data: fontData, style: 'normal', weight: 700 }],
    },
  );
}
