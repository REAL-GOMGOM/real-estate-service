/**
 * Public snapshot coverage must not exceed the period proven fresh by the
 * Mac mini sync marker. Increase this only after a durable coverage ledger or
 * an explicitly verified backfill is part of the sync contract.
 */
export const PUBLIC_TRANSACTION_SNAPSHOT_MONTHS = 2 as const;
