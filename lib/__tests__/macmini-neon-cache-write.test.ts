import { describe, expect, it } from 'vitest';

import { isMacMiniNeonCacheWriteEnabled } from '../macmini-neon-cache-write';

describe('Mac mini -> Neon serving cache opt-in', () => {
  it('is disabled unless NAEZIP_ENABLE_NEON_CACHE_WRITE is exactly 1', () => {
    expect(isMacMiniNeonCacheWriteEnabled({})).toBe(false);
    expect(isMacMiniNeonCacheWriteEnabled({ NAEZIP_ENABLE_NEON_CACHE_WRITE: '' })).toBe(false);
    expect(isMacMiniNeonCacheWriteEnabled({ NAEZIP_ENABLE_NEON_CACHE_WRITE: '0' })).toBe(false);
    expect(isMacMiniNeonCacheWriteEnabled({ NAEZIP_ENABLE_NEON_CACHE_WRITE: 'true' })).toBe(false);
    expect(isMacMiniNeonCacheWriteEnabled({ NAEZIP_ENABLE_NEON_MIRROR: '1' })).toBe(false);
    expect(isMacMiniNeonCacheWriteEnabled({ NAEZIP_ENABLE_NEON_CACHE_WRITE: '1' })).toBe(true);
  });
});
