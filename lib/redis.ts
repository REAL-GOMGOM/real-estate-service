import { Redis } from '@upstash/redis';

// Vercel KV 환경변수 (KV_REST_API_URL, KV_REST_API_TOKEN) 자동 읽음
export const redis = Redis.fromEnv();
