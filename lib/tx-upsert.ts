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
 *
 * 배치 내 선(先) 병합(collapseByKey): 국토부는 원거래와 그 해제를 **별개
 * item** 으로 내려주는데, 취소여부는 dedupeKey 에서 제외했으므로 둘이 같은
 * 키가 된다. 같은 INSERT 문에 동일 conflict 대상이 둘 이상이면 Postgres 가
 * "ON CONFLICT DO UPDATE cannot affect row a second time" 로 거부하므로,
 * upsert 전에 같은 키를 하나로 합치되 해제 상태를 반영한다.
 */

export type TxDb = NeonHttpDatabase<typeof schema>;

// Neon HTTP 단일 statement 페이로드·파라미터 한도 방어용 청크 크기
const UPSERT_CHUNK = 500;

/** 배치 내 dedupeKey 중복 병합 — 정상+해제가 같은 키면 해제 상태로 수렴 */
export function collapseByKey(rows: NewTransaction[]): NewTransaction[] {
  const map = new Map<string, NewTransaction>();
  for (const r of rows) {
    const prev = map.get(r.dedupeKey);
    if (!prev) {
      map.set(r.dedupeKey, r);
      continue;
    }
    // 같은 물리 거래가 정상+해제 두 레코드로 온 경우 — 해제 상태·부가정보 병합
    map.set(r.dedupeKey, {
      ...prev,
      isCanceled:   !!prev.isCanceled || !!r.isCanceled,
      canceledDate: prev.canceledDate ?? r.canceledDate ?? null,
      rgstDate:     prev.rgstDate ?? r.rgstDate ?? null,
      dealingGbn:   prev.dealingGbn ?? r.dealingGbn ?? null,
    });
  }
  return [...map.values()];
}

export async function upsertTransactions(db: TxDb, rows: NewTransaction[]): Promise<number> {
  const deduped = collapseByKey(rows);
  let count = 0;
  for (let i = 0; i < deduped.length; i += UPSERT_CHUNK) {
    const chunk = deduped.slice(i, i + UPSERT_CHUNK);
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
