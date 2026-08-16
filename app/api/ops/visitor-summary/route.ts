import { NextResponse } from 'next/server';
import { getVisitorSummary } from '@/lib/visitor-analytics';

const PUBLIC_CACHE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET() {
  const summary = await getVisitorSummary();
  return NextResponse.json(summary, { headers: PUBLIC_CACHE_HEADERS });
}
