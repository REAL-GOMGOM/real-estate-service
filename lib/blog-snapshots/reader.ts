import { createHash } from 'node:crypto';

import {
  PUBLIC_BLOG_MANIFEST_KEY,
  PUBLIC_BLOG_MAX_MANIFEST_BYTES,
  PublicBlogSnapshotValidationError,
  assertPublicBlogPayloadMatchesManifest,
  assertPublicBlogSnapshotManifest,
  assertPublicBlogSnapshotPayload,
  type PublicBlogSnapshotManifest,
  type PublicBlogSnapshotPayload,
} from './contract';

export const PUBLIC_BLOG_SNAPSHOT_BASE_URL_ENV = 'NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL' as const;

const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_TIMEOUT_MS = 30_000;

export interface PublicBlogSnapshotReaderOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  timeoutSignalFactory?: (timeoutMs: number) => AbortSignal;
  now?: () => Date;
}

export type PublicBlogSnapshotReadResult =
  | { status: 'available'; payload: PublicBlogSnapshotPayload }
  | { status: 'unavailable'; reason: 'disabled' };

function assertPublicBlobOrigin(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Public blog snapshot base URL is invalid');
  }
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
    || url.pathname !== '/'
    || !url.hostname.endsWith('.public.blob.vercel-storage.com')) {
    throw new Error('Public blog snapshot base URL must be an exact Vercel Blob public HTTPS origin');
  }
  return url;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export class PublicBlogSnapshotReader {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly timeoutSignalFactory: (timeoutMs: number) => AbortSignal;
  private readonly now: () => Date;

  constructor(options: PublicBlogSnapshotReaderOptions) {
    this.baseUrl = assertPublicBlobOrigin(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs)
      || this.timeoutMs < 1
      || this.timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error(`Public blog snapshot timeout must be between 1 and ${MAX_TIMEOUT_MS}ms`);
    }
    this.timeoutSignalFactory = options.timeoutSignalFactory
      ?? ((timeoutMs) => AbortSignal.timeout(timeoutMs));
    this.now = options.now ?? (() => new Date());
  }

  private objectUrl(key: string): URL {
    if (!/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(key)
      || key.startsWith('/')
      || key.includes('..')
      || key.includes('\\')) {
      throw new PublicBlogSnapshotValidationError('reader', ['snapshot key is unsafe']);
    }
    const url = new URL(key, this.baseUrl);
    if (url.origin !== this.baseUrl.origin
      || url.pathname !== `/${key}`
      || url.search
      || url.hash) {
      throw new PublicBlogSnapshotValidationError('reader', ['snapshot key escaped its public origin']);
    }
    return url;
  }

  private async fetchObject(label: string, key: string, maxBytes: number, cache: RequestCache): Promise<Uint8Array> {
    const url = this.objectUrl(key);
    const signal = this.timeoutSignalFactory(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json', 'accept-encoding': 'identity' },
        cache,
        redirect: 'error',
        signal,
      });
    } catch {
      if (signal.aborted) throw new Error(`Public blog snapshot ${label} request timed out`);
      throw new Error(`Public blog snapshot ${label} request failed`);
    }
    if (!response.ok) {
      throw new Error(`Public blog snapshot ${label} request failed: HTTP ${response.status}`);
    }
    if (response.url && response.url !== url.toString()) {
      throw new PublicBlogSnapshotValidationError(label, ['response URL escaped the pinned object']);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') {
      throw new PublicBlogSnapshotValidationError(label, ['response content type is invalid']);
    }
    const contentEncoding = response.headers.get('content-encoding');
    if (contentEncoding && contentEncoding.toLowerCase() !== 'identity') {
      throw new PublicBlogSnapshotValidationError(label, ['response content encoding is invalid']);
    }
    const contentLengthRaw = response.headers.get('content-length');
    const contentLength = contentLengthRaw === null ? null : Number(contentLengthRaw);
    if (contentLength !== null
      && (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maxBytes)) {
      throw new PublicBlogSnapshotValidationError(label, ['response body length is invalid']);
    }
    if (!response.body) {
      throw new PublicBlogSnapshotValidationError(label, ['response body is absent']);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (chunk.value.byteLength > maxBytes - byteLength) {
          await reader.cancel().catch(() => undefined);
          throw new PublicBlogSnapshotValidationError(label, ['response body exceeds its byte limit']);
        }
        chunks.push(chunk.value);
        byteLength += chunk.value.byteLength;
      }
    } catch (error) {
      if (error instanceof PublicBlogSnapshotValidationError) throw error;
      if (signal.aborted) throw new Error(`Public blog snapshot ${label} request timed out`);
      throw new Error(`Public blog snapshot ${label} body read failed`);
    } finally {
      reader.releaseLock();
    }
    if (contentLength !== null && contentLength !== byteLength) {
      throw new PublicBlogSnapshotValidationError(label, ['response body length does not match metadata']);
    }
    const body = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  }

  private parseJson(body: Uint8Array, label: string): unknown {
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      throw new PublicBlogSnapshotValidationError(label, ['response is not valid UTF-8 JSON']);
    }
  }

  async getManifest(): Promise<PublicBlogSnapshotManifest> {
    const body = await this.fetchObject(
      'manifest',
      PUBLIC_BLOG_MANIFEST_KEY,
      PUBLIC_BLOG_MAX_MANIFEST_BYTES,
      'no-store',
    );
    const value = this.parseJson(body, 'manifest');
    assertPublicBlogSnapshotManifest(value, { now: this.now() });
    return value;
  }

  async getSnapshot(): Promise<PublicBlogSnapshotPayload> {
    const manifest = await this.getManifest();
    const body = await this.fetchObject(
      'payload',
      manifest.payload.key,
      manifest.payload.byteLength,
      'force-cache',
    );
    if (body.byteLength !== manifest.payload.byteLength) {
      throw new PublicBlogSnapshotValidationError('payload', ['byte length does not match manifest']);
    }
    if (sha256(body) !== manifest.payload.sha256) {
      throw new PublicBlogSnapshotValidationError('payload', ['SHA-256 does not match manifest']);
    }
    const value = this.parseJson(body, 'payload');
    assertPublicBlogSnapshotPayload(value, { now: this.now() });
    assertPublicBlogPayloadMatchesManifest(value, manifest);
    return value;
  }
}

export async function readPublicBlogSnapshotFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  options: Omit<PublicBlogSnapshotReaderOptions, 'baseUrl'> = {},
): Promise<PublicBlogSnapshotReadResult> {
  const baseUrl = env[PUBLIC_BLOG_SNAPSHOT_BASE_URL_ENV]?.trim();
  if (!baseUrl) return { status: 'unavailable', reason: 'disabled' };
  const reader = new PublicBlogSnapshotReader({ ...options, baseUrl });
  return { status: 'available', payload: await reader.getSnapshot() };
}
