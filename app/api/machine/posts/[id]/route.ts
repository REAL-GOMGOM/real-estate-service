import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { posts } from '@/lib/db/schema';
import { verifyMachineToken } from '@/lib/api/machine-auth';
import { setPostPublished } from '@/lib/blog/publish';

/**
 * 머신 발행 API — 글 발행/삭제.
 *
 * PATCH  /api/machine/posts/[id]  — draft → published 전환 (멱등)
 * DELETE /api/machine/posts/[id]  — draft 글 삭제 (published 는 409 거부)
 *
 * 인증: Authorization: Bearer <MACHINE_PUBLISH_SECRET>
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

function revalidatePublic(id: string) {
  revalidatePath('/admin/posts');
  revalidatePath(`/admin/posts/${id}/edit`);
  revalidatePath('/blog');
  revalidatePath('/sitemap.xml');
}

/**
 * PATCH — 발행.
 * 이미 published 여도 publishedAt 은 COALESCE 로 보존되어 멱등 동작.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = verifyMachineToken(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '잘못된 글 식별자' }, { status: 400 });
  }

  const published = await setPostPublished(id);
  if (!published) {
    return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });
  }

  revalidatePublic(id);

  const publishedUrl = `/blog/${published.slug}`;
  return NextResponse.json({ id: published.id, slug: published.slug, publishedUrl });
}

/**
 * DELETE — draft 삭제.
 * published 글은 실수 방지를 위해 삭제 거부(409). 없으면 404.
 */
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const auth = verifyMachineToken(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '잘못된 글 식별자' }, { status: 400 });
  }

  const db = getBlogDb();
  const rows = await db
    .select({ status: posts.status })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: '글을 찾을 수 없습니다' }, { status: 404 });
  }
  if (row.status === 'published') {
    return NextResponse.json(
      { error: '발행된 글은 삭제할 수 없습니다. 먼저 발행을 취소하세요.' },
      { status: 409 },
    );
  }

  await db.delete(posts).where(eq(posts.id, id));
  revalidatePublic(id);

  return NextResponse.json({ id, deleted: true });
}
