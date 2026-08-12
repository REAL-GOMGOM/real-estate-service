import { createHash, createHmac, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  get as getVercelBlob,
  put as putVercelBlob,
  type GetBlobResult,
  type PutBlobResult,
} from '@vercel/blob';

import {
  PUBLIC_TRANSACTION_SNAPSHOT_PREFIX,
  PUBLIC_TRANSACTION_MANIFEST_SCHEMA,
  assertPublicTransactionManifest,
} from './contract';

export interface PublicSnapshotPutInput {
  key: string;
  body: Uint8Array;
  contentType: 'application/json';
  contentEncoding?: 'gzip';
  cacheControl: string;
  sha256: string;
  immutable: boolean;
}

export interface PublicSnapshotPutResult {
  key: string;
  url: string;
  etag: string | null;
  byteLength: number;
}

export interface PublicSnapshotObjectStore {
  putObject(input: PublicSnapshotPutInput): Promise<PublicSnapshotPutResult>;
}

export class PublicSnapshotConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicSnapshotConfigurationError';
  }
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertSafeObjectKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(key)
    || key.startsWith('/')
    || key.includes('..')
    || key.includes('\\')
    || /\.(?:dump|sql|sqlite|db)(?:\.|$)/i.test(key)) {
    throw new PublicSnapshotConfigurationError(`Unsafe public snapshot object key: ${key}`);
  }
}

const PUBLIC_TRANSACTION_DISCOVERY_MANIFEST_KEY = `${PUBLIC_TRANSACTION_SNAPSHOT_PREFIX}/manifest.json`;
const MAX_DISCOVERY_MANIFEST_BYTES = 10 * 1024 * 1024;

type VercelBlobPut = typeof putVercelBlob;
type VercelBlobGet = typeof getVercelBlob;

function cacheControlMaxAge(cacheControl: string): number {
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i);
  const seconds = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(seconds) || seconds < 60) {
    throw new PublicSnapshotConfigurationError(
      'Vercel Blob cacheControl must contain max-age of at least 60 seconds',
    );
  }
  return seconds;
}

function assertPublicBlobBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicSnapshotConfigurationError(
      'NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL must be a valid Vercel Blob public origin',
    );
  }
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== '/'
    || !url.hostname.endsWith('.public.blob.vercel-storage.com')) {
    throw new PublicSnapshotConfigurationError(
      'NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL must be the HTTPS origin of a public Vercel Blob store',
    );
  }
  return url;
}

function assertLegacyBlobTokenMatchesOrigin(token: string, publicBaseUrl: URL): void {
  // @vercel/blob read-write tokens encode their store id as
  // `vercel_blob_rw_{storeId}_{secret}`. Validate that routing metadata before
  // the first PUT so a copied token cannot orphan public objects in another
  // store. Never include any token segment in the error message.
  const [vendor, product, permission, storeId, secret, ...rest] = token.split('_');
  if (vendor !== 'vercel'
    || product !== 'blob'
    || permission !== 'rw'
    || !storeId
    || !secret
    || rest.some((part) => !part)) {
    throw new PublicSnapshotConfigurationError(
      'NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN must be a valid Vercel Blob read-write token',
    );
  }
  const expectedHostname = `${storeId}.public.blob.vercel-storage.com`.toLowerCase();
  if (publicBaseUrl.hostname.toLowerCase() !== expectedHostname) {
    throw new PublicSnapshotConfigurationError(
      'NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN store does not match NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL',
    );
  }
}

function assertVercelBlobResult(
  result: Pick<PutBlobResult, 'url' | 'pathname'>,
  key: string,
  expectedBaseUrl: URL,
): URL {
  if (result.pathname !== key) {
    throw new PublicSnapshotConfigurationError(`Vercel Blob returned an unexpected pathname for ${key}`);
  }
  let url: URL;
  try {
    url = new URL(result.url);
  } catch {
    throw new PublicSnapshotConfigurationError(`Vercel Blob returned an invalid public URL for ${key}`);
  }
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || !url.hostname.endsWith('.public.blob.vercel-storage.com')
    || url.origin !== expectedBaseUrl.origin
    || url.pathname !== `/${key}`) {
    throw new PublicSnapshotConfigurationError(
      `Vercel Blob public URL does not match NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL for ${key}`,
    );
  }
  return url;
}

function parseDiscoveryManifest(body: Uint8Array): {
  publishedAt: string;
  releaseId: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body).toString('utf8'));
  } catch {
    throw new PublicSnapshotConfigurationError('Public transaction discovery manifest is invalid JSON');
  }
  assertPublicTransactionManifest(parsed);
  if (parsed.schema !== PUBLIC_TRANSACTION_MANIFEST_SCHEMA) {
    throw new PublicSnapshotConfigurationError('Public transaction discovery manifest schema is unsupported');
  }
  return { publishedAt: parsed.publishedAt, releaseId: parsed.releaseId };
}

export interface VercelBlobSnapshotStoreConfig {
  token: string;
  publicBaseUrl: string;
  putImpl?: VercelBlobPut;
  getImpl?: VercelBlobGet;
}

/**
 * Public Vercel Blob adapter.
 *
 * Release objects use deterministic keys and can never be overwritten. The
 * single mutable discovery manifest is uploaded last by the generic publisher;
 * its current ETag and publishedAt prevent concurrent or older producers from
 * moving discovery backwards.
 */
export class VercelBlobSnapshotStore implements PublicSnapshotObjectStore {
  private readonly token: string;
  private readonly publicBaseOrigin: URL;
  private readonly putImpl: VercelBlobPut;
  private readonly getImpl: VercelBlobGet;

  constructor(config: VercelBlobSnapshotStoreConfig) {
    const token = config.token.trim();
    if (!token) {
      throw new PublicSnapshotConfigurationError('NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN is required');
    }
    this.publicBaseOrigin = assertPublicBlobBaseUrl(config.publicBaseUrl);
    assertLegacyBlobTokenMatchesOrigin(token, this.publicBaseOrigin);
    this.token = token;
    this.putImpl = config.putImpl ?? putVercelBlob;
    this.getImpl = config.getImpl ?? getVercelBlob;
  }

  get publicBaseUrl(): string {
    return this.publicBaseOrigin.toString();
  }

  private pinAndValidateResult(
    result: Pick<PutBlobResult, 'url' | 'pathname'>,
    key: string,
  ): URL {
    return assertVercelBlobResult(result, key, this.publicBaseOrigin);
  }

  private async readExistingBlob(
    key: string,
    maxBytes: number,
    operation: 'manifest preflight' | 'immutable recovery',
  ): Promise<{ result: GetBlobResult & { statusCode: 200 }; body: Buffer } | null> {
    let result: GetBlobResult | null;
    try {
      result = await this.getImpl(key, {
        access: 'public',
        token: this.token,
        useCache: false,
        abortSignal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new Error(`Vercel Blob ${operation} failed for ${key}`);
    }
    if (!result) return null;
    if (result.statusCode !== 200 || result.blob.size > maxBytes) {
      throw new Error(`Vercel Blob ${operation} returned invalid metadata for ${key}`);
    }
    this.pinAndValidateResult(result.blob, key);
    let body: Buffer;
    try {
      body = Buffer.from(await new Response(result.stream).arrayBuffer());
    } catch {
      throw new Error(`Vercel Blob ${operation} body failed for ${key}`);
    }
    if (body.byteLength !== result.blob.size) {
      throw new Error(`Vercel Blob ${operation} body length mismatch for ${key}`);
    }
    return { result: result as GetBlobResult & { statusCode: 200 }, body };
  }

  private currentDiscoveryManifest(
    input: PublicSnapshotPutInput,
  ): Promise<{ result: GetBlobResult & { statusCode: 200 }; body: Buffer } | null> {
    return this.readExistingBlob(input.key, MAX_DISCOVERY_MANIFEST_BYTES, 'manifest preflight');
  }

  async putObject(input: PublicSnapshotPutInput): Promise<PublicSnapshotPutResult> {
    assertSafeObjectKey(input.key);
    const body = Buffer.from(input.body);
    if (sha256(body) !== input.sha256) {
      throw new PublicSnapshotConfigurationError(`Body checksum mismatch for ${input.key}`);
    }
    if (!input.immutable && input.key !== PUBLIC_TRANSACTION_DISCOVERY_MANIFEST_KEY) {
      throw new PublicSnapshotConfigurationError(
        `Only the public transaction discovery manifest may be mutable: ${input.key}`,
      );
    }

    let current: Awaited<ReturnType<VercelBlobSnapshotStore['currentDiscoveryManifest']>> = null;
    if (!input.immutable) {
      const candidate = parseDiscoveryManifest(body);
      current = await this.currentDiscoveryManifest(input);
      if (current) {
        const existing = parseDiscoveryManifest(current.body);
        const existingTime = Date.parse(existing.publishedAt);
        const candidateTime = Date.parse(candidate.publishedAt);
        if (existingTime > candidateTime) {
          throw new Error(`Vercel Blob refused discovery manifest regression for ${input.key}`);
        }
        if (existingTime === candidateTime) {
          if (existing.releaseId !== candidate.releaseId || sha256(current.body) !== input.sha256) {
            throw new Error(`Vercel Blob refused conflicting discovery manifest for ${input.key}`);
          }
          return {
            key: input.key,
            url: current.result.blob.url,
            etag: current.result.blob.etag,
            byteLength: body.byteLength,
          };
        }
      }
    }

    let result: PutBlobResult;
    try {
      result = await this.putImpl(input.key, body, {
        access: 'public',
        token: this.token,
        contentType: input.contentType,
        cacheControlMaxAge: cacheControlMaxAge(input.cacheControl),
        addRandomSuffix: false,
        // Immutable release keys fail on any collision. Only the fixed discovery
        // manifest opts into overwrite and uses the current ETag when it exists.
        allowOverwrite: !input.immutable && current !== null,
        ...(current ? { ifMatch: current.result.blob.etag } : {}),
        abortSignal: AbortSignal.timeout(60_000),
      });
    } catch {
      // A retry after a partially completed release must be idempotent. Vercel
      // Blob rejects deterministic immutable pathname collisions by default;
      // accept only byte-for-byte identical content already stored there.
      if (input.immutable) {
        const existing = await this.readExistingBlob(
          input.key,
          body.byteLength,
          'immutable recovery',
        );
        if (existing
          && existing.body.byteLength === body.byteLength
          && sha256(existing.body) === input.sha256) {
          return {
            key: input.key,
            url: existing.result.blob.url,
            etag: existing.result.blob.etag,
            byteLength: body.byteLength,
          };
        }
      }
      // SDK errors may contain request URLs or token-derived identifiers. Never
      // include the original message/body in application or launchd logs.
      throw new Error(`Vercel Blob PutObject failed for ${input.key}`);
    }
    const publicUrl = this.pinAndValidateResult(result, input.key);
    return {
      key: input.key,
      url: publicUrl.toString(),
      etag: result.etag || null,
      byteLength: body.byteLength,
    };
  }
}

/**
 * Local-only sink used by explicit CLI dry-runs and factory callers without a
 * selected production store.
 * Immutable objects are never overwritten with different bytes.
 */
export class LocalDryRunSnapshotStore implements PublicSnapshotObjectStore {
  readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  private destination(key: string): string {
    assertSafeObjectKey(key);
    const destination = path.resolve(this.rootDir, key);
    if (destination !== this.rootDir && !destination.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new PublicSnapshotConfigurationError('Snapshot key escapes the dry-run directory');
    }
    return destination;
  }

  async putObject(input: PublicSnapshotPutInput): Promise<PublicSnapshotPutResult> {
    const actualSha256 = sha256(input.body);
    if (actualSha256 !== input.sha256) {
      throw new PublicSnapshotConfigurationError(`Body checksum mismatch for ${input.key}`);
    }
    const destination = this.destination(input.key);
    await mkdir(path.dirname(destination), { recursive: true });

    if (input.immutable) {
      try {
        const existing = await readFile(destination);
        if (sha256(existing) !== input.sha256) {
          throw new PublicSnapshotConfigurationError(`Immutable object already exists with different bytes: ${input.key}`);
        }
        return {
          key: input.key,
          url: new URL(`file://${destination}`).toString(),
          etag: null,
          byteLength: input.body.byteLength,
        };
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      }
    }

    const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temporary, input.body);
    try {
      if (input.immutable) {
        try {
          await link(temporary, destination);
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
          const existing = await readFile(destination);
          if (sha256(existing) !== input.sha256) {
            throw new PublicSnapshotConfigurationError(`Immutable object race produced different bytes: ${input.key}`);
          }
        }
      } else {
        await rename(temporary, destination);
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
    return {
      key: input.key,
      url: new URL(`file://${destination}`).toString(),
      etag: null,
      byteLength: input.body.byteLength,
    };
  }
}

export interface R2S3SnapshotStoreConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeObjectKey(key: string): string {
  return key.split('/').map(rfc3986).join('/');
}

function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac('sha256', key).update(value, 'utf8').digest();
}

function normalizeHeaderValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Minimal S3 PutObject adapter using AWS Signature Version 4 and native fetch. */
export class R2S3SnapshotStore implements PublicSnapshotObjectStore {
  private readonly config: R2S3SnapshotStoreConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: R2S3SnapshotStoreConfig) {
    for (const [name, value] of Object.entries({
      accountId: config.accountId,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucket: config.bucket,
    })) {
      if (!value) throw new PublicSnapshotConfigurationError(`Missing R2 setting: ${name}`);
    }
    if (!/^[A-Za-z0-9-]{1,64}$/.test(config.accountId)) {
      throw new PublicSnapshotConfigurationError('Invalid R2 accountId');
    }
    if (config.endpoint) {
      let endpoint: URL;
      try {
        endpoint = new URL(config.endpoint);
      } catch {
        throw new PublicSnapshotConfigurationError('Invalid R2 endpoint');
      }
      if (endpoint.protocol !== 'https:'
        || endpoint.username
        || endpoint.password
        || endpoint.search
        || endpoint.hash) {
        throw new PublicSnapshotConfigurationError(
          'R2 endpoint must use HTTPS without credentials, query, or fragment',
        );
      }
    }
    this.config = config;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private objectUrl(key: string): URL {
    assertSafeObjectKey(key);
    const endpoint = new URL(
      this.config.endpoint ?? `https://${this.config.accountId}.r2.cloudflarestorage.com`,
    );
    const basePath = endpoint.pathname.replace(/\/+$/, '');
    endpoint.pathname = `${basePath}/${rfc3986(this.config.bucket)}/${encodeObjectKey(key)}`;
    endpoint.search = '';
    endpoint.hash = '';
    return endpoint;
  }

  async putObject(input: PublicSnapshotPutInput): Promise<PublicSnapshotPutResult> {
    const body = Buffer.from(input.body);
    const payloadHash = sha256(body);
    if (payloadHash !== input.sha256) {
      throw new PublicSnapshotConfigurationError(`Body checksum mismatch for ${input.key}`);
    }

    const url = this.objectUrl(input.key);
    const now = (this.config.now ?? (() => new Date()))();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const headers: Record<string, string> = {
      'cache-control': input.cacheControl,
      'content-type': input.contentType,
      host: url.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'x-amz-meta-naezip-sha256': payloadHash,
    };
    if (input.contentEncoding) headers['content-encoding'] = input.contentEncoding;

    const headerNames = Object.keys(headers).sort();
    const canonicalHeaders = headerNames
      .map((name) => `${name}:${normalizeHeaderValue(headers[name])}\n`)
      .join('');
    const signedHeaders = headerNames.join(';');
    const canonicalRequest = [
      'PUT',
      url.pathname,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/auto/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
    ].join('\n');
    const dateKey = hmac(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const regionKey = hmac(dateKey, 'auto');
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await this.fetchImpl(url, {
      method: 'PUT',
      headers: { ...headers, authorization },
      body,
    });
    if (!response.ok) {
      // S3-compatible error XML can echo the access-key identifier. Never copy
      // an untrusted response body into launchd/application logs.
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`R2 PutObject failed for ${input.key}: HTTP ${response.status}`);
    }
    return {
      key: input.key,
      url: url.toString(),
      etag: response.headers.get('etag'),
      byteLength: body.byteLength,
    };
  }
}

export interface SnapshotStoreSelection {
  mode: 'blob' | 'r2' | 'local-dry-run';
  store: PublicSnapshotObjectStore;
  dryRunDirectory: string | null;
}

export function createPublicSnapshotStoreFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: {
    fetchImpl?: typeof fetch;
    now?: () => Date;
    blobPutImpl?: VercelBlobPut;
    blobGetImpl?: VercelBlobGet;
  } = {},
): SnapshotStoreSelection {
  const requestedMode = env.NAEZIP_SNAPSHOT_STORE?.trim().toLowerCase();
  if (requestedMode && requestedMode !== 'blob' && requestedMode !== 'r2') {
    throw new PublicSnapshotConfigurationError('NAEZIP_SNAPSHOT_STORE must be blob or r2');
  }
  const blobToken = env.NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN?.trim();
  if (requestedMode === 'blob') {
    if (!blobToken) {
      throw new PublicSnapshotConfigurationError(
        'NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN is required for the production Vercel Blob snapshot store',
      );
    }
    return {
      mode: 'blob',
      store: new VercelBlobSnapshotStore({
        token: blobToken,
        publicBaseUrl: env.NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL ?? '',
        putImpl: options.blobPutImpl,
        getImpl: options.blobGetImpl,
      }),
      dryRunDirectory: null,
    };
  }

  const values = {
    accountId: env.NAEZIP_SNAPSHOT_R2_ACCOUNT_ID,
    accessKeyId: env.NAEZIP_SNAPSHOT_R2_ACCESS_KEY_ID,
    secretAccessKey: env.NAEZIP_SNAPSHOT_R2_SECRET_ACCESS_KEY,
    bucket: env.NAEZIP_SNAPSHOT_R2_BUCKET,
  };
  const present = Object.values(values).filter((value) => Boolean(value)).length;
  if (present === 0) {
    if (requestedMode === 'r2') {
      throw new PublicSnapshotConfigurationError(
        'All R2 settings are required when NAEZIP_SNAPSHOT_STORE=r2',
      );
    }
    const dryRunDirectory = path.resolve(
      env.NAEZIP_SNAPSHOT_DRY_RUN_DIR ?? path.join(process.cwd(), '.local', 'public-snapshot-dry-run'),
    );
    return {
      mode: 'local-dry-run',
      store: new LocalDryRunSnapshotStore(dryRunDirectory),
      dryRunDirectory,
    };
  }
  if (present !== Object.keys(values).length) {
    const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
    throw new PublicSnapshotConfigurationError(`Partial R2 configuration; missing: ${missing.join(', ')}`);
  }
  return {
    mode: 'r2',
    store: new R2S3SnapshotStore({
      accountId: values.accountId!,
      accessKeyId: values.accessKeyId!,
      secretAccessKey: values.secretAccessKey!,
      bucket: values.bucket!,
      endpoint: env.NAEZIP_SNAPSHOT_R2_ENDPOINT || undefined,
      fetchImpl: options.fetchImpl,
      now: options.now,
    }),
    dryRunDirectory: null,
  };
}
