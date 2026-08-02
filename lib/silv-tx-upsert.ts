import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
// 상대경로 import — Next 라우트 + 로컬 스크립트 양쪽 재사용 (별칭 비의존)
import * as schema from './db/schema';
import { silvTransactions, type NewSilvTransactionRow } from './db/schema';

/**
 * 분양권 멱등 upsert — 분양권 DB 적재 (2026-08-02).
 *
 * 매매(tx-upsert)와 동일 원리: 배치 내 동일 dedupeKey 선병합(원거래+해제가
 * 별개 item 으로 와도 같은 키) 후 청크 upsert. 충돌 시 식별 컬럼은 불변,
 * 취소 플래그·해제일만 갱신.
 */

export type SilvTxDb = NeonHttpDatabase<typeof schema>;

const UPSERT_CHUNK = 600;

/** 배치 내 dedupeKey 중복 병합 — 정상+해제가 같은 키면 해제 상태로 수렴 */
export function collapseSilvByKey(rows: NewSilvTransactionRow[]): NewSilvTransactionRow[] {
  const map = new Map<string, NewSilvTransactionRow>();
  for (const r of rows) {
    const prev = map.get(r.dedupeKey);
    if (!prev) {
      map.set(r.dedupeKey, r);
      continue;
    }
    map.set(r.dedupeKey, {
      ...prev,
      isCanceled:   !!prev.isCanceled || !!r.isCanceled,
      canceledDate: prev.canceledDate ?? r.canceledDate ?? null,
    });
  }
  return [...map.values()];
}

export async function upsertSilvTransactions(
  db: SilvTxDb,
  rows: NewSilvTransactionRow[],
): Promise<number> {
  const deduped = collapseSilvByKey(rows);
  let count = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_CHUNK) {
    const chunk = deduped.slice(i, i + UPSERT_CHUNK);
    if (chunk.length === 0) continue;
    await db
      .insert(silvTransactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: silvTransactions.dedupeKey,
        set: {
          isCanceled:   sql`excluded.is_canceled`,
          canceledDate: sql`excluded.canceled_date`,
          updatedAt:    new Date(),
        },
      });
    count += chunk.length;
  }
  return count;
}
