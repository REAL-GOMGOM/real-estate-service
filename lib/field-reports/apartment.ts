import 'server-only';
import { cacheLife } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getBlogDb } from '@/lib/db/client';
import { apartments } from '@/lib/db/schema';
import { createPublicSnapshotRuntimeFromEnv, isPublicSnapshotConfigured } from '@/lib/public-snapshots/runtime';
import { APARTMENT_INDEX_ARTIFACT_NAME, APARTMENT_INDEX_MAX_AGE_MS, assertApartmentIndexEnvelope, isServingArtifactFresh, type ApartmentIndexItem } from '@/lib/public-snapshots/serving-artifacts';

async function loadIndex() {
  'use cache';
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  const result = await createPublicSnapshotRuntimeFromEnv().getNamedArtifact<ApartmentIndexItem[]>(APARTMENT_INDEX_ARTIFACT_NAME);
  if (result.status !== 'success') throw new Error('apartment-index-unavailable');
  assertApartmentIndexEnvelope(result.data);
  if (!isServingArtifactFresh(result.data.generatedAt, { maxAgeMs: APARTMENT_INDEX_MAX_AGE_MS })) throw new Error('apartment-index-stale');
  return result.data.data;
}

/** Never trust an apartment name/address supplied by the browser. */
export async function resolveFieldReportApartment(id: string) {
  if (isPublicSnapshotConfigured()) {
    return (await loadIndex()).find((item) => item.id === id) ?? null;
  }
  const result = await getBlogDb().select({ id: apartments.id, name: apartments.name, sido: apartments.sido, sigungu: apartments.sigungu, dong: apartments.dong }).from(apartments).where(eq(apartments.id, id)).limit(1);
  return result[0] ?? null;
}
