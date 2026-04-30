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
};

export default nextConfig;
