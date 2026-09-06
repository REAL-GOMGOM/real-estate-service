import { eq } from 'drizzle-orm';
import { getBlogDb } from './db/client';
import { apartments } from './db/schema';
import { findDistrictByLawdCd } from './district-codes';
import type { PublicSnapshotRuntime } from './public-snapshots/runtime';
import {
  APARTMENT_INDEX_ARTIFACT_NAME,
  APARTMENT_INDEX_MAX_AGE_MS,
  assertApartmentIndexEnvelope,
  findApartmentIndexById,
  isServingArtifactFresh,
  type ApartmentIndexItem,
} from './public-snapshots/serving-artifacts';

type ApartmentSelectionResult =
  | { ok: true; apartment: ApartmentIndexItem; district: string }
  | { ok: false; status: 404 | 503; error: string };

/** Resolve an exact selection from trusted metadata, never from URL name/dong hints. */
export async function resolveTransactionApartmentSelection(input: {
  aptId: string;
  runtime: Pick<PublicSnapshotRuntime, 'getNamedArtifact'>;
  allowDbFallback: boolean;
}): Promise<ApartmentSelectionResult> {
  let hasVerifiedIndex = false;
  try {
    const result = await input.runtime.getNamedArtifact<ApartmentIndexItem[]>(APARTMENT_INDEX_ARTIFACT_NAME);
    if (result.status === 'success') {
      assertApartmentIndexEnvelope(result.data);
      if (isServingArtifactFresh(result.data.generatedAt, { maxAgeMs: APARTMENT_INDEX_MAX_AGE_MS })) {
        hasVerifiedIndex = true;
        const apartment = findApartmentIndexById(result.data.data, input.aptId);
        if (apartment) {
          return { ok: true, apartment, district: findDistrictByLawdCd(apartment.lawdCd) ?? apartment.sigungu };
        }
      }
    }
  } catch {
    // Invalid/unavailable identity metadata is not evidence of zero transactions.
  }

  if (input.allowDbFallback) {
    try {
      const rows = await getBlogDb().select({
        id: apartments.id,
        name: apartments.name,
        aliases: apartments.aliases,
        sido: apartments.sido,
        sigungu: apartments.sigungu,
        dong: apartments.dong,
        lawdCd: apartments.lawdCd,
        totalHouseholds: apartments.totalHouseholds,
      }).from(apartments).where(eq(apartments.id, input.aptId)).limit(1);
      const row = rows[0];
      if (!row) return { ok: false, status: 404, error: 'apartment not found' };
      const apartment: ApartmentIndexItem = { ...row, score: null };
      return { ok: true, apartment, district: findDistrictByLawdCd(apartment.lawdCd) ?? apartment.sigungu };
    } catch {
      return { ok: false, status: 503, error: '단지 기준 데이터를 확인할 수 없습니다' };
    }
  }

  return hasVerifiedIndex
    ? { ok: false, status: 404, error: 'apartment not found' }
    : { ok: false, status: 503, error: '단지 기준 데이터를 확인할 수 없습니다' };
}
