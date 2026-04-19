/**
 * Dynamic OG Image for /region/[id] — Phase 5c-7 Stage 3
 * 126개 지역마다 고유 OG 이미지 생성.
 */

import { ImageResponse } from 'next/og';
import { getRegionById, getAllRegionIds } from '@/lib/region-data';
import { OgImageTemplate } from '@/components/og/OgImageTemplate';
import fs from 'node:fs/promises';
import path from 'node:path';

export const alt = '내집(NAEZIP) 지역 입지 분석';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateStaticParams() {
  const ids = await getAllRegionIds();
  return ids.map((id) => ({ id }));
}

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

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Image({ params }: PageProps) {
  const { id } = await params;
  const region = await getRegionById(id);

  if (!region) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            background: '#FAFAFA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '60px',
            fontFamily: 'system-ui',
            color: '#2A2420',
          }}
        >
          내집 — 지역을 찾을 수 없습니다
        </div>
      ),
      { ...size },
    );
  }

  const pretendardData = await loadPretendard();

  return new ImageResponse(<OgImageTemplate region={region} />, {
    ...size,
    fonts: [
      {
        name: 'Pretendard',
        data: pretendardData,
        style: 'normal',
        weight: 400,
      },
    ],
  });
}
