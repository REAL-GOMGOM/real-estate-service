const LOCAL_POSTGRES_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ROUTING_OVERRIDE_PARAMETERS = new Set(['host', 'hostaddr', 'service']);

/**
 * Proves that a PostgreSQL connection URL is pinned to this Mac.
 *
 * libpq-compatible clients can honor query-string routing overrides after the
 * URL authority has been parsed. Reject those parameters rather than allowing
 * an apparently-local URL to route sync writes or snapshot reads elsewhere.
 */
export function assertMacLocalDatabaseUrl(raw: string | undefined): string {
  if (!raw) throw new Error('NAEZIP_LOCAL_DB_URL is required');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('NAEZIP_LOCAL_DB_URL is not a valid PostgreSQL URL');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('NAEZIP_LOCAL_DB_URL must use postgres:// or postgresql://');
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!LOCAL_POSTGRES_HOSTS.has(host)) {
    throw new Error('NAEZIP_LOCAL_DB_URL must point to the local Mac mini PostgreSQL instance');
  }

  for (const key of parsed.searchParams.keys()) {
    if (ROUTING_OVERRIDE_PARAMETERS.has(key.toLowerCase())) {
      throw new Error(
        `NAEZIP_LOCAL_DB_URL must not use PostgreSQL routing override parameter: ${key}`,
      );
    }
  }

  return raw;
}
