'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { fieldReportConfig } from '@/lib/field-reports/config';
import { fieldReportStore } from '@/lib/field-reports/repository';
import { resolveFieldReportApartment } from '@/lib/field-reports/apartment';
import { isFlagReason, parseFieldReportForm, REPORT_ID_PATTERN } from '@/lib/field-reports/validation';
import type { FieldReportActionState, FieldReportFlagState } from '@/lib/field-reports/types';
import { getVisitorClientIp } from '@/lib/visitor-analytics';

async function allowRequest(kind: 'submit' | 'flag') {
  const config = fieldReportConfig();
  if (kind === 'submit' ? !config.submissionsEnabled : !config.flagsEnabled) return false;
  const ip = getVisitorClientIp(await headers());
  // Unidentifiable traffic must not bypass the distributed rate limit.
  if (!ip || ip.length > 100) return false;
  return fieldReportStore().consumeRateLimit(kind, ip, config.salt!);
}

export async function submitFieldReport(_previous: FieldReportActionState, form: FormData): Promise<FieldReportActionState> {
  const input = parseFieldReportForm(form);
  if ('error' in input) return { status: 'error', message: input.error };
  try {
    if (!fieldReportConfig().submissionsEnabled) return { status: 'error', message: '제보 접수를 준비 중입니다. 입력 내용은 저장되지 않았습니다.' };
    if (!await allowRequest('submit')) return { status: 'error', message: '현재 접수할 수 없습니다. 요청 횟수 제한 또는 연결 상태를 확인하고 나중에 다시 시도해 주세요.' };
    const apartment = await resolveFieldReportApartment(input.apartmentId);
    if (!apartment) return { status: 'error', message: '선택한 단지를 확인할 수 없습니다. 단지를 다시 검색해 주세요.' };
    const receipt = await fieldReportStore().create(input, apartment);
    return { status: 'success', receipt, message: '제보가 접수되었습니다. 동일한 내용은 한 번만 접수되며, 관리자 검수 후 공개됩니다.' };
  } catch {
    // No raw provider errors / posted values in logs (may contain credentials).
    console.warn('[field-reports] submission unavailable');
    return { status: 'error', message: '접수 결과를 확인하지 못했습니다. 잠시 후 같은 내용으로 다시 시도해 주세요. 중복 접수는 방지됩니다.' };
  }
}

export async function reportFieldReport(_previous: FieldReportFlagState, form: FormData): Promise<FieldReportFlagState> {
  const id = form.get('reportId');
  const reason = form.get('reason');
  if (typeof id !== 'string' || !REPORT_ID_PATTERN.test(id) || !isFlagReason(reason) || form.getAll('reportId').length !== 1 || form.getAll('reason').length !== 1) return { status: 'error', message: '신고할 제보와 사유를 확인해 주세요.' };
  try {
    if (!await allowRequest('flag')) return { status: 'error', message: '현재 신고를 접수할 수 없습니다. 잠시 후 다시 시도하거나 문의 이메일을 이용해 주세요.' };
    if (!await fieldReportStore().flag(id, reason)) return { status: 'error', message: '현재 공개 중인 제보를 찾을 수 없습니다.' };
    revalidatePath('/admin/field-reports');
    return { status: 'success', message: '신고가 접수되었습니다. 운영자가 검토합니다.' };
  } catch {
    console.warn('[field-reports] flag unavailable');
    return { status: 'error', message: '신고 접수 결과를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.' };
  }
}
