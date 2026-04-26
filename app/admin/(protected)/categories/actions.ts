'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getBlogDb } from '@/lib/db/client';
import { categories } from '@/lib/db/schema';

/**
 * 카테고리 Server Action.
 *
 * 권한: 모든 액션 시작에 어드민 검증.
 * 검증: slug [a-z0-9-]{1,64}, name 1~100자, description 0~500자.
 * useActionState 호환 시그니처 (_prev, formData).
 */

const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;
const NAME_MAX = 100;
const DESC_MAX = 500;

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    redirect('/admin/login');
  }
}

export type ActionState = null | { ok: true } | { error: string };

export async function createCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const descriptionRaw = String(formData.get('description') ?? '').trim();
  const description = descriptionRaw.length > 0 ? descriptionRaw : null;

  if (!SLUG_PATTERN.test(slug)) {
    return { error: 'slug는 영문 소문자·숫자·하이픈 1~64자만 허용됩니다' };
  }
  if (name.length === 0 || name.length > NAME_MAX) {
    return { error: `이름은 1~${NAME_MAX}자로 입력해주세요` };
  }
  if (description && description.length > DESC_MAX) {
    return { error: `설명은 ${DESC_MAX}자 이내로 입력해주세요` };
  }

  try {
    await getBlogDb().insert(categories).values({ slug, name, description });
  } catch (e) {
    console.error('[categories.create] 에러:', e);
    return { error: '이미 존재하는 slug이거나 저장 중 오류가 발생했습니다' };
  }

  revalidatePath('/admin/categories');
  return { ok: true };
}
