import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  // `process.cwd()`로 읽는 OG 폰트는 정적 분석만으로 함수 번들에 포함되지 않는다.
  // 모든 opengraph-image Node route trace에 필요한 파일 한 개만 명시적으로 포함한다.
  outputFileTracingIncludes: {
    '/opengraph-image': ['./public/fonts/Pretendard-Bold.otf'],
  },
  // Vercel Blob 업로드 이미지를 next/Image가 최적화하도록 허용
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
      {
        protocol: 'https',
        hostname: '*.blob.vercel-storage.com',
      },
    ],
  },
  async redirects() {
    return [
      // 리포트 영역 종료 — 칼럼으로 일원화 (301 영구 이동, SEO 자산 보존)
      { source: '/report', destination: '/blog', permanent: true },
      // 미래 추가될 하위 URL 대비 와일드카드 (현재는 동적 segment 없지만 방어적)
      { source: '/report/:path*', destination: '/blog', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
