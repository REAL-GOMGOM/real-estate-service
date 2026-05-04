import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  serverExternalPackages: ['better-sqlite3'],
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
};

export default nextConfig;
