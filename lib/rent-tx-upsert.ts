import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
// 상대경로 import — Next 라우트 + 로컬 백필 스크립트 양쪽 재사용 (별칭 비의존)
import * as schema from './db/schema';
import { rentTransactions, type NewRentTransactionRow } from './db/schema';

/**
 * 전월세 멱등 upsert — 전월세 DB 적재 (2026-07-18).
 *
 * 매매(tx-upsert)와 동일 원리: 배치 내 동일 dedupeKey 선병합(Postgres
 * "cannot affect row a second time" 방어) 후 청크 upsert. 충돌 시 식별
 * 컬럼은 불변, 나중에 확정되는 속성(계약구분·종전가)만 갱신한다.
 */

export type RentTxDb = NeonHttpDatabase<typeof schema>;

// Neon HTTP 단일 statement 페이로드·파라미터 한도 방어 (전월세는 컬럼 적어 600행)
const UPSERT_CHUNK = 600;

/** 배치 내 dedupeKey 중복 병합 — 나중 레코드의 확정 속성 우선 (last-wins 보강) */
export function collapseRentByKey(rows: NewRentTransactionRow[]): NewRentTransactionRow[] {
  const map = new Map<string, NewRentTransactionRow>();
  for (const r of rows) {
    const prev = map.get(r.dedupeKey);
    if (!prev) {
      map.set(r.dedupeKey, r);
      continue;
    }
    map.set(r.dedupeKey, {
      ...prev,
      contractType:    r.contractType ?? prev.contractType ?? null,
      prevDeposit:     r.prevDeposit ?? prev.prevDeposit ?? null,
      prevMonthlyRent: r.prevMonthlyRent ?? prev.prevMonthlyRent ?? null,
    });
  }
  return [...map.values()];
}

export async function upsertRentTransactions(
  db: RentTxDb,
  rows: NewRentTransactionRow[],
): Promise<number> {
  const deduped = collapseRentByKey(rows);
  let count = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_CHUNK) {
    const chunk = deduped.slice(i, i + UPSERT_CHUNK);
    if (chunk.length === 0) continue;
    await db
      .insert(rentTransactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: rentTransactions.dedupeKey,
        set: {
          contractType:    sql`excluded.contract_type`,
          prevDeposit:     sql`excluded.prev_deposit`,
          prevMonthlyRent: sql`excluded.prev_monthly_rent`,
          updatedAt:       new Date(),
        },
      });
    count += chunk.length;
  }
  return count;
}
