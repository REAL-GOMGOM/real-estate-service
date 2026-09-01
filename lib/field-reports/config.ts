import 'server-only';
import { Redis } from '@upstash/redis';

type Env = Record<string, string | undefined>;
export function fieldReportConfig(env: Env = process.env) {
  // Explicit opt-in can use the existing managed Free store without exporting
  // its sensitive credentials. No implicit fallback between stores is allowed.
  const source = env.NAEZIP_FIELD_REPORTS_REDIS_SOURCE?.trim() || 'dedicated';
  const url = (source === 'visitors'
    ? env.UPSTASH_REDIS_REST_KV_REST_API_URL
    : env.NAEZIP_FIELD_REPORTS_REDIS_REST_URL)?.trim();
  const token = (source === 'visitors'
    ? env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
    : env.NAEZIP_FIELD_REPORTS_REDIS_REST_TOKEN)?.trim();
  const salt = env.NAEZIP_FIELD_REPORTS_IP_SALT?.trim();
  // The source flag names one exact credential pair, never the retired KV.
  let validUrl = false;
  try { const parsed = new URL(url ?? ''); validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { /* unconfigured */ }
  const configured = ['dedicated', 'visitors'].includes(source) && validUrl && Boolean(token);
  const environment = env.VERCEL_ENV === 'production' ? 'production' : env.VERCEL_ENV === 'preview' ? 'preview' : 'development';
  return {
    source, url, token, salt,
    prefix: `naezip:field-reports:v1:${environment}`,
    configured,
    flagsEnabled: configured && Boolean(salt && salt.length >= 32),
    submissionsEnabled: configured && Boolean(salt && salt.length >= 32) && env.NAEZIP_FIELD_REPORTS_ENABLED === '1',
  };
}

export function createFieldReportRedis() {
  const { configured, url, token } = fieldReportConfig();
  if (!configured) throw new Error('field-report-store-unconfigured');
  return new Redis({ url: url!, token: token!, signal: () => AbortSignal.timeout(5_000), enableTelemetry: false, retry: { retries: 1, backoff: () => 200 } });
}
