export class MolitSyncSanityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MolitSyncSanityError';
  }
}

/**
 * Confirms that the concatenated page payload contains exactly the number of
 * items announced by the first MOLIT response. A schema drift that makes the
 * parser silently return zero must fail the local sync rather than republish an
 * old ledger with a fresh snapshot timestamp.
 */
export function assertMolitParsedItemCount(
  xml: string,
  parsedItemCount: number,
  context: string,
): void {
  const match = xml.match(/<totalCount>\s*(\d+)\s*<\/totalCount>/);
  if (!match) throw new MolitSyncSanityError(`MOLIT ${context}: totalCount is missing`);
  const totalCount = Number(match[1]);
  if (!Number.isSafeInteger(totalCount) || totalCount < 0) {
    throw new MolitSyncSanityError(`MOLIT ${context}: totalCount is invalid`);
  }
  if (!Number.isSafeInteger(parsedItemCount) || parsedItemCount < 0 || parsedItemCount !== totalCount) {
    throw new MolitSyncSanityError(
      `MOLIT ${context}: parsed item count ${parsedItemCount} does not match totalCount ${totalCount}`,
    );
  }
}

export interface MolitMappedRows<Row> {
  rows: Row[];
  rejectedCount: number;
}

/**
 * Preserves small batches of known-invalid rows while failing before upsert on
 * a bounded normalization/schema-drift signal: at least ten rejects making up
 * more than 20% of the response. XML count parity and nationwide publisher
 * completeness/recency gates provide the broader structural checks.
 */
export function mapMolitItemsWithRejectionGate<Item, Row>(
  items: readonly Item[],
  mapper: (item: Item) => Row | null,
  context: string,
): MolitMappedRows<Row> {
  const rows: Row[] = [];
  let rejectedCount = 0;
  for (const item of items) {
    const row = mapper(item);
    if (row === null) rejectedCount += 1;
    else rows.push(row);
  }
  const rejectionRate = items.length === 0 ? 0 : rejectedCount / items.length;
  if (rejectedCount >= 10 && rejectionRate > 0.2) {
    throw new MolitSyncSanityError(
      `MOLIT ${context}: normalization rejected ${rejectedCount}/${items.length} items`,
    );
  }
  return { rows, rejectedCount };
}
