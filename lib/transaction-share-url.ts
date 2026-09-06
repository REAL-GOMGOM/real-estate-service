export interface TransactionShareApartment {
  name: string;
  district: string;
  dong?: string | null;
  /** Only a verified apartment master ID, never the display/group ID. */
  masterId?: string | null;
}

export interface TransactionShareUrlInput {
  origin: string;
  apartment: TransactionShareApartment;
  months?: number;
  dealType?: 'buy' | 'bunyang' | 'jeonse' | 'monthly';
  /** Contract key from txKey or rentTxKey, according to dealType. */
  tx?: string;
}

/** Preserve the apartment identity, active market and contract in every share channel. */
export function buildTransactionShareUrl({
  origin, apartment, months, dealType = 'buy', tx,
}: TransactionShareUrlInput): string {
  const url = new URL('/transactions', origin);
  url.searchParams.set('district', apartment.district);
  url.searchParams.set('q', apartment.name);
  if (apartment.masterId) url.searchParams.set('aptId', apartment.masterId);
  if (apartment.dong) url.searchParams.set('aptDong', apartment.dong);
  if (months !== undefined) url.searchParams.set('months', String(months));
  if (dealType !== 'buy') url.searchParams.set('dealType', dealType);
  if (tx) {
    url.searchParams.set(dealType === 'jeonse' || dealType === 'monthly' ? 'rtx' : 'tx', tx);
  }
  return url.toString();
}
