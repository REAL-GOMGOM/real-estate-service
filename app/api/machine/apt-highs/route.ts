import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { aptHighs } from '@/lib/db/schema';
import { verifyMachineToken } from '@/lib/api/machine-auth';

/**
 * 머신 API — 단지·면적별 역대 전고점 upsert (사이클 FF).
 *
 * POST /api/machine/apt-highs
 * body: { highs: [{ district, aptName, area, price, dealDate }] }  (price 만원)
 *
 * - 인증: Authorization: Bearer <MACHINE_PUBLISH_SECRET>
 * - 기존보다 높은 가격일 때만 갱신 (전고점 불변 조건)
 * - 호출처: 봇 일일 신고가 push. 시드 스크립트는 DB 직접 접근.
 */

const MAX_ROWS = 2000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface HighRow {
  district: string;
  aptName:  string;
  area:     number;
  price:    number;
  dealDate: string;
}

function validate(body: unknown): { ok: true; rows: HighRow[] } | { ok: false; error: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: '본문이 없습니다' };
  const highs = (body as { highs?: unknown }).highs;
  if (!Array.isArray(highs) || highs.length === 0) return { ok: false, error: 'highs 배열이 비어 있습니다' };
  if (highs.length > MAX_ROWS) return { ok: false, error: `한 번에 최대 ${MAX_ROWS}건` };

  const rows: HighRow[] = [];
  for (const raw of highs) {
    const r = raw as Record<string, unknown>;
    const district = typeof r.district === 'string' ? r.district.trim() : '';
    const aptName  = typeof r.aptName === 'string' ? r.aptName.trim() : '';
    const area     = Number(r.area);
    const price    = Number(r.price);
    const dealDate = typeof r.dealDate === 'string' ? r.dealDate : '';

    if (!district || district.length > 20) return { ok: false, error: `district 불량: ${district}` };
    if (!aptName || aptName.length > 100)  return { ok: false, error: `aptName 불량: ${aptName.slice(0, 30)}` };
    if (!Number.isInteger(area) || area < 5 || area > 400) return { ok: false, error: `area 불량: ${area}` };
    if (!Number.isInteger(price) || price <= 0 || price > 100_000_000) return { ok: false, error: `price 불량: ${price}` };
    if (!DATE_PATTERN.test(dealDate)) return { ok: false, error: `dealDate 불량: ${dealDate}` };

    rows.push({ district, aptName, area, price, dealDate });
  }
  return { ok: true, rows };
}

export async function POST(req: NextRequest) {
  const auth = verifyMachineToken(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON 파싱 실패' }, { status: 400 });
  }

  const parsed = validate(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const db = getBlogDb();
    const values = parsed.rows.map((r) => ({
      id:       `${r.district}|${r.aptName}|${r.area}`,
      district: r.district,
      aptName:  r.aptName,
      area:     r.area,
      price:    r.price,
      dealDate: r.dealDate,
      source:   'bot' as const,
    }));

    // 전고점 불변 조건 — 더 높은 가격이 올 때만 가격·일자·출처 갱신
    await db
      .insert(aptHighs)
      .values(values)
      .onConflictDoUpdate({
        target: aptHighs.id,
        set: {
          price:    sql`GREATEST(${aptHighs.price}, excluded.price)`,
          dealDate: sql`CASE WHEN excluded.price > ${aptHighs.price} THEN excluded.deal_date ELSE ${aptHighs.dealDate} END`,
          source:   sql`CASE WHEN excluded.price > ${aptHighs.price} THEN excluded.source ELSE ${aptHighs.source} END`,
          updatedAt: sql`now()`,
        },
      });

    return NextResponse.json({ received: values.length });
  } catch (e) {
    console.error('[machine/apt-highs] upsert 실패:', e);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}
