import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
// 상대경로 import — Next 라우트 + 로컬 백필 스크립트 양쪽 재사용 (tsx 별칭 비의존)
import * as schema from './db/schema';
import { transactions, type NewTransaction } from './db/schema';

/**
 * 실거래 멱등 upsert — Phase 2 (자체 DB 적재).
 *
 * 백필 스크립트와 일일 sync 크론이 공유한다. dedupeKey 충돌 시 식별 컬럼은
 * 불변으로 두고, 나중에 확정되는 속성만 갱신한다 (취소 플래그·해제일·등기일·
 * 거래유형). masterId 는 갱신 대상에서 제외 — 적재 시 항상 null 이라 덮으면
 * 별도 매칭 결과를 지우게 되므로 기존 값을 보존한다.
 */

export type TxDb = NeonHttpDatabase<typeof schema>;

// Neon HTTP 단일 statement 페이로드·파라미터 한도 방어용 청크 크기
const UPSERT_CHUNK = 500;

export async function upsertTransactions(db: TxDb, rows: NewTransaction[]): Promise<number> {
  let count = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    if (chunk.length === 0) continue;
    await db
      .insert(transactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: transactions.dedupeKey,
        set: {
          isCanceled:   sql`excluded.is_canceled`,
          canceledDate: sql`excluded.canceled_date`,
          rgstDate:     sql`excluded.rgst_date`,
          dealingGbn:   sql`excluded.dealing_gbn`,
          updatedAt:    new Date(),
        },
      });
    count += chunk.length;
  }
  return count;
}
