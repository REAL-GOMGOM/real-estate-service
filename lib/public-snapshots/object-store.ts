import { createHash, createHmac, randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

/**
 * Local-only sink used when all R2 credentials are absent.
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
      const detail = (await response.text().catch(() => '')).slice(0, 1000);
      throw new Error(`R2 PutObject failed for ${input.key}: HTTP ${response.status}${detail ? ` ${detail}` : ''}`);
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
  mode: 'r2' | 'local-dry-run';
  store: PublicSnapshotObjectStore;
  dryRunDirectory: string | null;
}

export function createPublicSnapshotStoreFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: { fetchImpl?: typeof fetch; now?: () => Date } = {},
): SnapshotStoreSelection {
  const values = {
    accountId: env.NAEZIP_SNAPSHOT_R2_ACCOUNT_ID,
    accessKeyId: env.NAEZIP_SNAPSHOT_R2_ACCESS_KEY_ID,
    secretAccessKey: env.NAEZIP_SNAPSHOT_R2_SECRET_ACCESS_KEY,
    bucket: env.NAEZIP_SNAPSHOT_R2_BUCKET,
  };
  const present = Object.values(values).filter((value) => Boolean(value)).length;
  if (present === 0) {
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
