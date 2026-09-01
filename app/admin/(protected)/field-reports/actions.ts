'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { isFieldReportAdmin } from '@/lib/field-reports/admin-auth';
import { moderateFieldReport } from '@/lib/field-reports/repository';

export type ModerationState =
  | null
  | { status: 'success' | 'error'; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function moderateFieldReportAction(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  // This POST endpoint must remain protected independently of the page/layout.
  if (!(await isFieldReportAdmin())) {
    return { status: 'error', message: '관리자 로그인이 필요합니다.' };
  }

  if (
    !(formData instanceof FormData) ||
    formData.getAll('id').length !== 1 ||
    formData.getAll('status').length !== 1
  ) {
    return { status: 'error', message: '제보와 처리 상태를 다시 확인해주세요.' };
  }

  const id = formData.get('id');
  const status = formData.get('status');
  if (
    typeof id !== 'string' ||
    !UUID_PATTERN.test(id) ||
    (status !== 'published' && status !== 'rejected' && status !== 'hidden')
  ) {
    return { status: 'error', message: '제보와 처리 상태를 다시 확인해주세요.' };
  }

  try {
    // The repository checks expiry again atomically; browser state is not trusted.
    const changed = await moderateFieldReport(id, status);
    if (!changed) {
      return {
        status: 'error',
        message: '제보가 없거나 만료되었거나, 현재 상태에서 처리할 수 없습니다. 목록을 새로고침해주세요.',
      };
    }
  } catch {
    return {
      status: 'error',
      message: '제보 저장소 준비가 필요하거나 일시적으로 연결할 수 없습니다. 잠시 후 다시 시도해주세요.',
    };
  } finally {
    // A timeout can follow an applied mutation. Expire public data after every
    // authorized, validated attempt so an applied hide cannot remain cached.
    updateTag('field-reports-public');
  }

  revalidatePath('/admin/field-reports');
  revalidatePath('/field-reports');
  revalidatePath('/');

  const message = {
    published: '게시 승인했습니다. 내용 검수 결과이며 거래 사실 인증은 아닙니다.',
    rejected: '제보를 반려했습니다. 공개 목록에 표시되지 않습니다.',
    hidden: '제보를 숨겼습니다. 공개 목록에 표시되지 않습니다.',
  }[status];
  return { status: 'success', message };
}
