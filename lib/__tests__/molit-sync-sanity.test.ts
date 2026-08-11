import { describe, expect, it } from 'vitest';

import {
  MolitSyncSanityError,
  assertMolitParsedItemCount,
  mapMolitItemsWithRejectionGate,
} from '../molit-sync-sanity';

describe('Mac mini MOLIT sync sanity gates', () => {
  it('uses the first totalCount and accepts the exact parsed item count', () => {
    const joinedPages = [
      '<response><totalCount> 2 </totalCount><item>a</item></response>',
      '<response><totalCount>2</totalCount><item>b</item></response>',
    ].join('\n');
    expect(() => assertMolitParsedItemCount(joinedPages, 2, 'trade/11680/202608'))
      .not.toThrow();
  });

  it('rejects parser/schema drift and missing totalCount', () => {
    expect(() => assertMolitParsedItemCount(
      '<response><totalCount>3</totalCount></response>',
      0,
      'rent/11680/202608',
    )).toThrow('does not match totalCount 3');
    expect(() => assertMolitParsedItemCount('<response/>', 0, 'silv/11680/202608'))
      .toThrow(MolitSyncSanityError);
  });

  it('allows one known-invalid source row and reports it as skipped', () => {
    expect(mapMolitItemsWithRejectionGate(
      ['valid', 'known-invalid'],
      (item) => item === 'known-invalid' ? null : { item },
      'rent/11680/202608',
    )).toEqual({ rows: [{ item: 'valid' }], rejectedCount: 1 });
  });

  it('allows a one-row known-invalid batch but blocks materially high rejection', () => {
    expect(mapMolitItemsWithRejectionGate(
      ['invalid'],
      () => null,
      'trade/11680/202608',
    )).toEqual({ rows: [], rejectedCount: 1 });

    const items = Array.from({ length: 40 }, (_, index) => index);
    expect(() => mapMolitItemsWithRejectionGate(
      items,
      (item) => item < 10 ? null : { item },
      'silv/11680/202608',
    )).toThrow('rejected 10/40 items');
  });
});
