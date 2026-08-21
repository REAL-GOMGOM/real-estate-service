import { createHash } from 'node:crypto';

import {
  get as getVercelBlob,
  put as putVercelBlob,
  type GetBlobResult,
  type PutBlobResult,
} from '@vercel/blob';

import { stableJson } from '@/lib/public-snapshots/artifact';

import {
  PUBLIC_BLOG_MANIFEST_KEY,
  PUBLIC_BLOG_MAX_MANIFEST_BYTES,
  PUBLIC_BLOG_MAX_PAYLOAD_BYTES,
  PUBLIC_BLOG_SNAPSHOT_PREFIX,
  assertPublicBlogSnapshotManifest,
  assertPublicBlogSnapshotPayload,
} from './contract';

export const PUBLIC_BLOG_BLOB_TOKEN_ENV = 'NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN' as const;
export const PUBLIC_BLOG_BLOB_BASE_URL_ENV = 'NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL' as const;
export const PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS = 31_536_000;
export const PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS = 60;
const MANAGEMENT_READ_TIMEOUT_MS = 30_000;
const PUT_TIMEOUT_MS = 60_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_ID_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;
const RELEASES_PREFIX = `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/`;

type VercelBlobPut = typeof putVercelBlob;
type VercelBlobGet = typeof getVercelBlob;

export type PublicBlogBlobObjectKind =
  | 'payload'
  | 'release-manifest'
  | 'discovery-manifest';

export interface PublicBlogBlobObjectInput {
  kind: PublicBlogBlobObjectKind;
  key: string;
  body: Uint8Array;
  sha256: string;
}

export interface PublicBlogBlobObjectResult {
  key: string;
  url: string;
  etag: string;
  byteLength: number;
}

export interface PublicBlogBlobManagementReadInput {
  kind: PublicBlogBlobObjectKind;
  key: string;
  sha256: string;
}

export interface PublicBlogBlobManagementReadResult extends PublicBlogBlobObjectResult {
  body: Buffer;
}

export interface PublicBlogRemoteObjectStore {
  readonly publicBaseUrl: string;
  putObject(input: PublicBlogBlobObjectInput): Promise<PublicBlogBlobObjectResult>;
  readObject(
    input: PublicBlogBlobManagementReadInput,
  ): Promise<PublicBlogBlobManagementReadResult>;
}

export class PublicBlogBlobConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBlogBlobConfigurationError';
  }
}

interface ObjectPolicy {
  immutable: boolean;
  maxBytes: number;
  cacheSeconds: number;
}

interface ParsedObject {
  value: Record<string, unknown>;
  policy: ObjectPolicy;
}

interface ExistingObject {
  body: Buffer;
  etag: string;
  url: string;
}

function sha256(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

function exactPublicBlobOrigin(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicBlogBlobConfigurationError(
      `${PUBLIC_BLOG_BLOB_BASE_URL_ENV} must be an exact public Vercel Blob origin`,
    );
  }
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
    || url.pathname !== '/'
    || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)) {
    throw new PublicBlogBlobConfigurationError(
      `${PUBLIC_BLOG_BLOB_BASE_URL_ENV} must be an exact public Vercel Blob origin`,
    );
  }
  return url;
}

function tokenStoreId(token: string): string {
  const match = token.match(
    /^vercel_blob_rw_([A-Za-z0-9-]+)_([A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)*)$/,
  );
  if (!match) {
    throw new PublicBlogBlobConfigurationError(
      `${PUBLIC_BLOG_BLOB_TOKEN_ENV} must be a valid Vercel Blob read-write token`,
    );
  }
  return match[1];
}

function assertTokenMatchesOrigin(token: string, origin: URL): void {
  const storeId = tokenStoreId(token);
  if (origin.hostname.toLowerCase()
    !== `${storeId}.public.blob.vercel-storage.com`.toLowerCase()) {
    throw new PublicBlogBlobConfigurationError(
      `${PUBLIC_BLOG_BLOB_TOKEN_ENV} store does not match ${PUBLIC_BLOG_BLOB_BASE_URL_ENV}`,
    );
  }
}

function decodeJson(body: Buffer, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new PublicBlogBlobConfigurationError(`${label} must be canonical UTF-8 JSON`);
  }
}

function objectPolicyAndValue(
  input: Pick<PublicBlogBlobObjectInput, 'body' | 'key' | 'kind'>,
  now: Date,
): ParsedObject {
  const body = Buffer.from(input.body);
  const value = decodeJson(body, `Public blog ${input.kind}`);
  let policy: ObjectPolicy;
  let expectedKey: string;
  if (input.kind === 'payload') {
    assertPublicBlogSnapshotPayload(value, { now });
    expectedKey = `${RELEASES_PREFIX}${value.releaseId}/payload.json`;
    policy = {
      immutable: true,
      maxBytes: PUBLIC_BLOG_MAX_PAYLOAD_BYTES,
      cacheSeconds: PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
    };
  } else {
    assertPublicBlogSnapshotManifest(value, { now });
    expectedKey = input.kind === 'release-manifest'
      ? `${RELEASES_PREFIX}${value.releaseId}/manifest.json`
      : PUBLIC_BLOG_MANIFEST_KEY;
    policy = {
      immutable: input.kind === 'release-manifest',
      maxBytes: PUBLIC_BLOG_MAX_MANIFEST_BYTES,
      cacheSeconds: input.kind === 'release-manifest'
        ? PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS
        : PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS,
    };
  }
  if (input.key !== expectedKey) {
    throw new PublicBlogBlobConfigurationError(`Public blog ${input.kind} key is invalid`);
  }
  if (body.byteLength < 1 || body.byteLength > policy.maxBytes) {
    throw new PublicBlogBlobConfigurationError(`Public blog ${input.kind} size is invalid`);
  }
  if (stableJson(value) !== body.toString('utf8')) {
    throw new PublicBlogBlobConfigurationError(`Public blog ${input.kind} JSON is not canonical`);
  }
  return { value: value as unknown as Record<string, unknown>, policy };
}

function assertChecksum(body: Uint8Array, expected: string): void {
  if (!SHA256_PATTERN.test(expected) || sha256(body) !== expected) {
    throw new PublicBlogBlobConfigurationError('Public blog Blob checksum is invalid');
  }
}

function validateBlobLocation(
  blob: Pick<PutBlobResult, 'contentType' | 'etag' | 'pathname' | 'url'>,
  key: string,
  origin: URL,
): string {
  let url: URL;
  try {
    url = new URL(blob.url);
  } catch {
    throw new PublicBlogBlobConfigurationError('Vercel Blob returned invalid public metadata');
  }
  if (blob.pathname !== key
    || blob.contentType !== 'application/json'
    || typeof blob.etag !== 'string'
    || !blob.etag.trim()
    || url.protocol !== 'https:'
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.origin !== origin.origin
    || url.pathname !== `/${key}`) {
    throw new PublicBlogBlobConfigurationError('Vercel Blob returned invalid public metadata');
  }
  return url.toString();
}

function cacheMaxAge(value: string): number | null {
  const match = value.match(/(?:^|,)\s*max-age=(\d+)\s*(?:,|$)/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function discoveryIdentity(value: Record<string, unknown>): {
  publishedAt: string;
  releaseId: string;
} {
  return {
    publishedAt: value.publishedAt as string,
    releaseId: value.releaseId as string,
  };
}

function safeNow(now: () => Date): Date {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PublicBlogBlobConfigurationError('Public blog Blob clock is invalid');
  }
  return value;
}

export interface PublicBlogVercelBlobStoreConfig {
  token: string;
  publicBaseUrl: string;
  putImpl?: VercelBlobPut;
  getImpl?: VercelBlobGet;
  now?: () => Date;
}

export class PublicBlogVercelBlobStore implements PublicBlogRemoteObjectStore {
  private readonly token: string;
  private readonly origin: URL;
  private readonly putImpl: VercelBlobPut;
  private readonly getImpl: VercelBlobGet;
  private readonly now: () => Date;

  constructor(config: PublicBlogVercelBlobStoreConfig) {
    const token = config.token.trim();
    if (!token) {
      throw new PublicBlogBlobConfigurationError(`${PUBLIC_BLOG_BLOB_TOKEN_ENV} is required`);
    }
    this.origin = exactPublicBlobOrigin(config.publicBaseUrl);
    assertTokenMatchesOrigin(token, this.origin);
    this.token = token;
    this.putImpl = config.putImpl ?? putVercelBlob;
    this.getImpl = config.getImpl ?? getVercelBlob;
    this.now = config.now ?? (() => new Date());
  }

  get publicBaseUrl(): string {
    return this.origin.toString();
  }

  private policyForKey(kind: PublicBlogBlobObjectKind, key: string): ObjectPolicy {
    if (kind === 'discovery-manifest') {
      if (key !== PUBLIC_BLOG_MANIFEST_KEY) {
        throw new PublicBlogBlobConfigurationError('Public blog discovery-manifest key is invalid');
      }
      return {
        immutable: false,
        maxBytes: PUBLIC_BLOG_MAX_MANIFEST_BYTES,
        cacheSeconds: PUBLIC_BLOG_DISCOVERY_CACHE_SECONDS,
      };
    }
    const suffix = kind === 'payload' ? '/payload.json' : '/manifest.json';
    const releaseId = key.startsWith(RELEASES_PREFIX) && key.endsWith(suffix)
      ? key.slice(RELEASES_PREFIX.length, -suffix.length)
      : '';
    if (!RELEASE_ID_PATTERN.test(releaseId)) {
      throw new PublicBlogBlobConfigurationError(`Public blog ${kind} key is invalid`);
    }
    return {
      immutable: true,
      maxBytes: kind === 'payload'
        ? PUBLIC_BLOG_MAX_PAYLOAD_BYTES
        : PUBLIC_BLOG_MAX_MANIFEST_BYTES,
      cacheSeconds: PUBLIC_BLOG_IMMUTABLE_CACHE_SECONDS,
    };
  }

  private async readStoredObject(
    input: Pick<PublicBlogBlobManagementReadInput, 'key' | 'kind'>,
    operation: 'preflight' | 'immutable recovery' | 'readback',
  ): Promise<ExistingObject | null> {
    const policy = this.policyForKey(input.kind, input.key);
    let result: GetBlobResult | null;
    try {
      result = await this.getImpl(input.key, {
        access: 'public',
        token: this.token,
        useCache: false,
        headers: { 'accept-encoding': 'identity' },
        abortSignal: AbortSignal.timeout(MANAGEMENT_READ_TIMEOUT_MS),
      });
    } catch {
      throw new Error(`Public blog Blob management ${operation} failed`);
    }
    if (!result) return null;
    if (result.statusCode !== 200
      || result.blob.pathname !== input.key
      || result.blob.contentType !== 'application/json'
      || !Number.isSafeInteger(result.blob.size)
      || result.blob.size < 1
      || result.blob.size > policy.maxBytes
      || typeof result.blob.etag !== 'string'
      || !result.blob.etag.trim()
      || !(result.blob.uploadedAt instanceof Date)
      || !Number.isFinite(result.blob.uploadedAt.getTime())
      || cacheMaxAge(result.blob.cacheControl) !== policy.cacheSeconds) {
      if (result.statusCode === 200) await result.stream.cancel().catch(() => undefined);
      throw new Error(`Public blog Blob management ${operation} metadata is invalid`);
    }
    const url = validateBlobLocation(result.blob, input.key, this.origin);
    const contentEncoding = result.headers.get('content-encoding');
    if (contentEncoding !== null && contentEncoding.toLowerCase() !== 'identity') {
      await result.stream.cancel().catch(() => undefined);
      throw new Error(`Public blog Blob management ${operation} metadata is invalid`);
    }
    const declaredLengthRaw = result.headers.get('content-length');
    const declaredLength = declaredLengthRaw === null ? null : Number(declaredLengthRaw);
    if (declaredLength !== null
      && (!Number.isSafeInteger(declaredLength) || declaredLength !== result.blob.size)) {
      await result.stream.cancel().catch(() => undefined);
      throw new Error(`Public blog Blob management ${operation} metadata is invalid`);
    }

    const chunks: Buffer[] = [];
    let byteLength = 0;
    const reader = result.stream.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value.byteLength > policy.maxBytes - byteLength) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`Public blog Blob management ${operation} body is invalid`);
        }
        chunks.push(Buffer.from(chunk.value));
        byteLength += chunk.value.byteLength;
      }
    } catch (error) {
      if (error instanceof Error
        && error.message === `Public blog Blob management ${operation} body is invalid`) {
        throw error;
      }
      throw new Error(`Public blog Blob management ${operation} body failed`);
    } finally {
      reader.releaseLock();
    }
    if (byteLength !== result.blob.size) {
      throw new Error(`Public blog Blob management ${operation} body is invalid`);
    }
    return {
      body: Buffer.concat(chunks, byteLength),
      etag: result.blob.etag,
      url,
    };
  }

  private resolveExistingDiscovery(
    candidate: Record<string, unknown>,
    candidateSha256: string,
    existing: ExistingObject,
  ): PublicBlogBlobObjectResult | null {
    const parsed = objectPolicyAndValue({
      kind: 'discovery-manifest',
      key: PUBLIC_BLOG_MANIFEST_KEY,
      body: existing.body,
    }, safeNow(this.now));
    const current = discoveryIdentity(parsed.value);
    const next = discoveryIdentity(candidate);
    const currentTime = Date.parse(current.publishedAt);
    const nextTime = Date.parse(next.publishedAt);
    if (currentTime > nextTime) {
      throw new Error('Public blog Blob refused discovery regression');
    }
    if (currentTime === nextTime) {
      if (current.releaseId !== next.releaseId || sha256(existing.body) !== candidateSha256) {
        throw new Error('Public blog Blob refused discovery conflict');
      }
      return {
        key: PUBLIC_BLOG_MANIFEST_KEY,
        url: existing.url,
        etag: existing.etag,
        byteLength: existing.body.byteLength,
      };
    }
    return null;
  }

  async putObject(input: PublicBlogBlobObjectInput): Promise<PublicBlogBlobObjectResult> {
    const body = Buffer.from(input.body);
    assertChecksum(body, input.sha256);
    const parsed = objectPolicyAndValue(input, safeNow(this.now));
    let existingDiscovery: ExistingObject | null = null;
    if (!parsed.policy.immutable) {
      existingDiscovery = await this.readStoredObject(input, 'preflight');
      if (existingDiscovery) {
        const resolved = this.resolveExistingDiscovery(
          parsed.value,
          input.sha256,
          existingDiscovery,
        );
        if (resolved) return resolved;
      }
    }

    let result: PutBlobResult;
    try {
      result = await this.putImpl(input.key, body, {
        access: 'public',
        token: this.token,
        contentType: 'application/json',
        cacheControlMaxAge: parsed.policy.cacheSeconds,
        addRandomSuffix: false,
        allowOverwrite: !parsed.policy.immutable && existingDiscovery !== null,
        ...(existingDiscovery ? { ifMatch: existingDiscovery.etag } : {}),
        abortSignal: AbortSignal.timeout(PUT_TIMEOUT_MS),
      });
    } catch {
      if (parsed.policy.immutable) {
        let existing: ExistingObject | null;
        try {
          existing = await this.readStoredObject(input, 'immutable recovery');
        } catch {
          throw new Error('Public blog Blob immutable recovery failed');
        }
        if (existing
          && existing.body.byteLength === body.byteLength
          && sha256(existing.body) === input.sha256) {
          return {
            key: input.key,
            url: existing.url,
            etag: existing.etag,
            byteLength: body.byteLength,
          };
        }
        throw new Error('Public blog Blob immutable put failed');
      }

      // Resolve a create/CAS race only when another producer installed these
      // exact discovery bytes. Never retry over a newer or conflicting value.
      let raced: ExistingObject | null;
      try {
        raced = await this.readStoredObject(input, 'preflight');
      } catch {
        throw new Error('Public blog Blob discovery update failed');
      }
      if (raced) {
        const resolved = this.resolveExistingDiscovery(parsed.value, input.sha256, raced);
        if (resolved) return resolved;
      }
      throw new Error('Public blog Blob discovery update failed');
    }
    const url = validateBlobLocation(result, input.key, this.origin);
    return {
      key: input.key,
      url,
      etag: result.etag,
      byteLength: body.byteLength,
    };
  }

  async readObject(
    input: PublicBlogBlobManagementReadInput,
  ): Promise<PublicBlogBlobManagementReadResult> {
    if (!SHA256_PATTERN.test(input.sha256)) {
      throw new PublicBlogBlobConfigurationError('Public blog Blob checksum is invalid');
    }
    const existing = await this.readStoredObject(input, 'readback');
    if (!existing || sha256(existing.body) !== input.sha256) {
      throw new Error('Public blog Blob management readback checksum failed');
    }
    objectPolicyAndValue({ ...input, body: existing.body }, safeNow(this.now));
    return {
      key: input.key,
      url: existing.url,
      etag: existing.etag,
      byteLength: existing.body.byteLength,
      body: existing.body,
    };
  }
}

export function createPublicBlogBlobStoreFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: Omit<Partial<PublicBlogVercelBlobStoreConfig>, 'publicBaseUrl' | 'token'> = {},
): PublicBlogVercelBlobStore {
  const token = env[PUBLIC_BLOG_BLOB_TOKEN_ENV]?.trim();
  if (!token) {
    throw new PublicBlogBlobConfigurationError(`${PUBLIC_BLOG_BLOB_TOKEN_ENV} is required`);
  }
  const publicBaseUrl = env[PUBLIC_BLOG_BLOB_BASE_URL_ENV]?.trim();
  if (!publicBaseUrl) {
    throw new PublicBlogBlobConfigurationError(`${PUBLIC_BLOG_BLOB_BASE_URL_ENV} is required`);
  }
  return new PublicBlogVercelBlobStore({
    ...options,
    token,
    publicBaseUrl,
  });
}
