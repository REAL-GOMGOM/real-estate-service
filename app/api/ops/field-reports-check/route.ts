import { createHash, timingSafeEqual } from 'node:crypto';
import { createFieldReportRedis } from '@/lib/field-reports/config';
import { runFieldReportStoreSmoke } from '@/scripts/check-field-reports-store';

// Keep Next's default Node runtime; do not add a segment runtime override with
// this application's cacheComponents build.
export const maxDuration = 60;

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

// Do not pass arbitrary provider/script output into the HTTP response. Only
// these exact, data-free messages can become public diagnostic labels.
const SAFE_CHECKS = new Map([
  ['[field-reports-store-check] PASS create, concurrent deduplication, pending privacy, retention TTL', 'create-deduplicate-pending-retention'],
  ['[field-reports-store-check] PASS moderation, publication, public-field whitelist, KEEPTTL', 'moderation-publication-whitelist-keep-ttl'],
  ['[field-reports-store-check] PASS report flags, first-flag preservation, admin hide, no republication', 'flag-hide-no-republication'],
  ['[field-reports-store-check] PASS rejection, 30-day public expiry, Redis expiry, stale-index safety', 'rejection-public-and-redis-expiry'],
  ['[field-reports-store-check] PASS per-IP and global submit/flag limits, rate TTL, denied-request atomicity', 'rate-limits-and-atomicity'],
  ['[field-reports-store-check] PASS exact-key cleanup', 'exact-key-cleanup'],
]);
const SAFE_FAILURE_STAGES = new Set([
  'initialization',
  'create-and-concurrent-deduplication',
  'publish-and-keep-ttl',
  'flag-and-hide',
  'reject-and-public-expiry',
  'rate-limits',
]);
const SAFE_FAILURE_CODES = new Set([
  'explicit-run-required',
  'unexpected-argument',
  'test-credentials-required',
  'invalid-test-url',
  'invalid-test-token',
  'unsafe-namespace',
  'unsafe-key',
  'unexpected-script',
  'invalid-eval-response',
  'lua-operation-failed',
  'assertion-failed',
  'cleanup-failed',
  'redis-operation-failed',
]);
const FAILURE_PREFIX = '[field-reports-store-check] FAIL ';
const SAFE_PROGRESS = new Map([
  ['[field-reports-store-check] DIAG empty indexes', 'empty-indexes'],
  ['[field-reports-store-check] DIAG concurrent creates fulfilled', 'concurrent-creates-fulfilled'],
  ['[field-reports-store-check] DIAG concurrent receipts deduplicated', 'concurrent-receipts-deduplicated'],
  ['[field-reports-store-check] DIAG pending draft readable', 'pending-draft-readable'],
  ['[field-reports-store-check] DIAG pending draft private', 'pending-draft-private'],
  ['[field-reports-store-check] DIAG dedupe pointer readable', 'dedupe-pointer-readable'],
  ['[field-reports-store-check] DIAG original retention observed', 'original-retention-observed'],
  ['[field-reports-store-check] DIAG smoke ttl capped', 'smoke-ttl-capped'],
  ['[field-reports-store-check] DIAG pending flag rejected', 'pending-flag-rejected'],
  ['[field-reports-store-check] DIAG publish mutation applied', 'publish-mutation-applied'],
  ['[field-reports-store-check] DIAG publish ttl retained', 'publish-ttl-retained'],
  ['[field-reports-store-check] DIAG public dto readable', 'public-dto-readable'],
  ['[field-reports-store-check] DIAG publish idempotent', 'publish-idempotent'],
]);

function notFound() {
  return Response.json({ error: 'not-found' }, { status: 404, headers: PRIVATE_HEADERS });
}

// This operation never has a browsable GET/HEAD interface, even in Preview.
export function GET() { return notFound(); }
export function HEAD() { return new Response(null, { status: 404, headers: PRIVATE_HEADERS }); }

export async function POST(request: Request) {
  // Keep all storage construction, credential resolution, and calls after
  // these gates. Production is unconditionally disabled, regardless of token.
  if (process.env.VERCEL_ENV !== 'preview' || process.env.NAEZIP_FIELD_REPORTS_CHECK_ENABLED !== '1') return notFound();
  const token = process.env.NAEZIP_FIELD_REPORTS_CHECK_TOKEN;
  if (!token || token.length < 32 || /[\x00-\x20\x7f]/.test(token)) return notFound();
  const supplied = request.headers.get('authorization') ?? '';
  const expectedHash = createHash('sha256').update(`Bearer ${token}`).digest();
  const suppliedHash = createHash('sha256').update(supplied).digest();
  if (!timingSafeEqual(expectedHash, suppliedHash)) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS });
  }

  // No target URL, key, namespace or fixture data may come from the caller.
  // Vercel can expose an empty POST as a non-null, chunked stream. Authentication
  // is already complete, so inspect the body itself and never forward it.
  const contentLength = request.headers.get('content-length');
  if (
    new URL(request.url).search !== ''
    || (contentLength !== null && contentLength !== '0')
  ) {
    return Response.json({ error: 'invalid-request' }, { status: 400, headers: PRIVATE_HEADERS });
  }
  if ((await request.arrayBuffer()).byteLength !== 0) {
    return Response.json({ error: 'invalid-request' }, { status: 400, headers: PRIVATE_HEADERS });
  }

  const checks: string[] = [];
  let failedStage: string | undefined;
  let failureCode: string | undefined;
  let lastProgress: string | undefined;
  try {
    await runFieldReportStoreSmoke(createFieldReportRedis(), (message) => {
      const safeLabel = SAFE_CHECKS.get(message);
      if (safeLabel && !checks.includes(safeLabel)) checks.push(safeLabel);
      lastProgress = SAFE_PROGRESS.get(message) ?? lastProgress;
      if (!message.startsWith(FAILURE_PREFIX)) return;
      const fields = message.slice(FAILURE_PREFIX.length).split(' ');
      if (fields.length !== 2 || !fields[0].startsWith('stage=') || !fields[1].startsWith('code=')) return;
      const stage = fields[0].slice('stage='.length);
      const code = fields[1].slice('code='.length);
      if (SAFE_FAILURE_STAGES.has(stage) && SAFE_FAILURE_CODES.has(code)) {
        failedStage = stage;
        failureCode = code;
      }
    });
    return Response.json({ status: 'passed', checks }, { headers: PRIVATE_HEADERS });
  } catch {
    // The script's own finalizer performs exact-key cleanup; its atomic TTL cap
    // also bounds abandoned fixtures. Never expose error messages or stacks.
    return Response.json({
      status: 'failed', error: 'store-check-failed', checks,
      ...(failedStage && failureCode ? { failedStage, failureCode } : {}),
      ...(lastProgress ? { lastProgress } : {}),
    }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
