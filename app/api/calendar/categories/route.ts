import { NextResponse } from 'next/server';
import { CATEGORY_MAP } from '@/types/calendar';

export async function GET() {
  const categories = Object.values(CATEGORY_MAP);
  return NextResponse.json({ categories });
}
