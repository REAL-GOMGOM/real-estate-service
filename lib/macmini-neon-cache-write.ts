/** Mac local ledger -> Neon serving-cache writes are explicit opt-in only. */
export function isMacMiniNeonCacheWriteEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.NAEZIP_ENABLE_NEON_CACHE_WRITE === '1';
}
