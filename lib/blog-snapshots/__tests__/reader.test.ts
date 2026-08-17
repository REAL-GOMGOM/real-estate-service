import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  PUBLIC_BLOG_MANIFEST_KEY,
  PUBLIC_BLOG_MANIFEST_SCHEMA,
  PUBLIC_BLOG_PAYLOAD_SCHEMA,
  PUBLIC_BLOG_SNAPSHOT_PREFIX,
  type PublicBlogSnapshotManifest,
  type PublicBlogSnapshotPayload,
} from '../contract';
import {
  PUBLIC_BLOG_SNAPSHOT_BASE_URL_ENV,
  PublicBlogSnapshotReader,
  readPublicBlogSnapshotFromEnv,
} from '../reader';

const BASE_URL = 'https://blog-store.public.blob.vercel-storage.com/';
const RELEASE_ID = '20200101T000000Z-aaaaaaaaaaaa';
const PAYLOAD_KEY = `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/${RELEASE_ID}/payload.json`;
const NOW = new Date('2035-01-01T00:00:00.000Z');

function fixture() {
  const payload: PublicBlogSnapshotPayload = {
    schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
    releaseId: RELEASE_ID,
    generatedAt: '2020-01-01T00:00:00.000Z',
    categories: [{
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'market',
      name: '시장',
    }],
    posts: [{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      slug: 'static-post',
      title: '정적 글',
      excerpt: null,
      coverImageUrl: null,
      publishedAt: '2019-12-31T00:00:00.000Z',
      categorySlug: 'market',
      categoryName: '시장',
      mdxContent: '# 정적 글',
      updatedAt: '2019-12-31T01:00:00.000Z',
    }],
  };
  const payloadBody = Buffer.from(JSON.stringify(payload));
  const manifest: PublicBlogSnapshotManifest = {
    schema: PUBLIC_BLOG_MANIFEST_SCHEMA,
    releaseId: RELEASE_ID,
    publishedAt: payload.generatedAt,
    payload: {
      key: PAYLOAD_KEY,
      schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
      contentType: 'application/json',
      sha256: createHash('sha256').update(payloadBody).digest('hex'),
      byteLength: payloadBody.byteLength,
      postCount: payload.posts.length,
      categoryCount: payload.categories.length,
    },
  };
  const manifestBody = Buffer.from(JSON.stringify(manifest));
  return { payload, payloadBody, manifest, manifestBody };
}

function jsonResponse(body: Uint8Array, extraHeaders: Record<string, string> = {}): Response {
  return new Response(Buffer.from(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(body.byteLength),
      ...extraHeaders,
    },
  });
}

function fixtureFetch(input = fixture()) {
  return vi.fn(async (request: URL | RequestInfo, _init?: RequestInit) => {
    const url = String(request);
    if (url === `${BASE_URL}${PUBLIC_BLOG_MANIFEST_KEY}`) {
      return jsonResponse(input.manifestBody);
    }
    if (url === `${BASE_URL}${PAYLOAD_KEY}`) return jsonResponse(input.payloadBody);
    return new Response(null, { status: 404 });
  });
}

describe('public blog snapshot reader', () => {
  it('reads an old-but-valid hash/length-bound snapshot from pinned public objects', async () => {
    const input = fixture();
    const fetchImpl = fixtureFetch(input);
    const reader = new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
    });

    await expect(reader.getSnapshot()).resolves.toEqual(input.payload);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      `${BASE_URL}${PUBLIC_BLOG_MANIFEST_KEY}`,
      `${BASE_URL}${PAYLOAD_KEY}`,
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({
        headers: { accept: 'application/json', 'accept-encoding': 'identity' },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      });
    }
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ cache: 'force-cache' });
  });

  it('returns unavailable without any fetch when the explicit public env is disabled', async () => {
    const fetchImpl = vi.fn();
    await expect(readPublicBlogSnapshotFromEnv({}, {
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toEqual({ status: 'unavailable', reason: 'disabled' });
    await expect(readPublicBlogSnapshotFromEnv({
      [PUBLIC_BLOG_SNAPSHOT_BASE_URL_ENV]: '   ',
    }, {
      fetchImpl: fetchImpl as typeof fetch,
    })).resolves.toEqual({ status: 'unavailable', reason: 'disabled' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires an exact Vercel Blob public HTTPS origin before fetching', async () => {
    const fetchImpl = vi.fn();
    for (const baseUrl of [
      'http://blog-store.public.blob.vercel-storage.com/',
      'https://user:pass@blog-store.public.blob.vercel-storage.com/',
      'https://blog-store.public.blob.vercel-storage.com/prefix/',
      'https://example.com/',
    ]) {
      expect(() => new PublicBlogSnapshotReader({
        baseUrl,
        fetchImpl: fetchImpl as typeof fetch,
      })).toThrow('exact Vercel Blob public HTTPS origin');
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a manifest payload key not pinned to its own immutable release', async () => {
    const input = fixture();
    input.manifest.payload.key = `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/20200101T000000Z-bbbbbbbbbbbb/payload.json`;
    input.manifestBody = Buffer.from(JSON.stringify(input.manifest));
    const fetchImpl = fixtureFetch(input);
    const reader = new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
    });

    await expect(reader.getSnapshot()).rejects.toThrow('not pinned to its release');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rejects payload hash and byte-length mismatches before returning content', async () => {
    const hashInput = fixture();
    hashInput.manifest.payload.sha256 = 'f'.repeat(64);
    hashInput.manifestBody = Buffer.from(JSON.stringify(hashInput.manifest));
    await expect(new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: fixtureFetch(hashInput) as typeof fetch,
      now: () => NOW,
    }).getSnapshot()).rejects.toThrow('SHA-256 does not match manifest');

    const lengthInput = fixture();
    lengthInput.manifest.payload.byteLength -= 1;
    lengthInput.manifestBody = Buffer.from(JSON.stringify(lengthInput.manifest));
    await expect(new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: fixtureFetch(lengthInput) as typeof fetch,
      now: () => NOW,
    }).getSnapshot()).rejects.toThrow('response body length is invalid');
  });

  it('requests identity encoding and rejects compressed response metadata', async () => {
    const input = fixture();
    const fetchImpl = vi.fn(async (request: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'accept-encoding': 'identity' });
      if (String(request).endsWith(PUBLIC_BLOG_MANIFEST_KEY)) return jsonResponse(input.manifestBody);
      return jsonResponse(input.payloadBody, { 'content-encoding': 'gzip' });
    });
    const reader = new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: fetchImpl as typeof fetch,
      now: () => NOW,
    });

    await expect(reader.getSnapshot()).rejects.toThrow('content encoding is invalid');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('bounds manifest/payload bodies and validates strict UTF-8 JSON', async () => {
    const input = fixture();
    const oversizedFetch = vi.fn(async (request: URL | RequestInfo) => {
      if (String(request).endsWith(PUBLIC_BLOG_MANIFEST_KEY)) return jsonResponse(input.manifestBody);
      const noLength = new Response(Buffer.concat([input.payloadBody, Buffer.from(' ')]), {
        headers: { 'content-type': 'application/json' },
      });
      return noLength;
    });
    await expect(new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: oversizedFetch as typeof fetch,
      now: () => NOW,
    }).getSnapshot()).rejects.toThrow('exceeds its byte limit');

    const invalidJson = vi.fn(async () => jsonResponse(Buffer.from([0xff])));
    await expect(new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: invalidJson as typeof fetch,
      now: () => NOW,
    }).getManifest()).rejects.toThrow('not valid UTF-8 JSON');
  });

  it('sanitizes fetch failures and reports bounded aborts as timeouts', async () => {
    const secret = 'token-and-private-url-must-not-leak';
    const failureReader = new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: vi.fn(async () => { throw new Error(secret); }) as typeof fetch,
    });
    let failure: unknown;
    try {
      await failureReader.getManifest();
    } catch (error) {
      failure = error;
    }
    expect((failure as Error).message).toBe('Public blog snapshot manifest request failed');
    expect((failure as Error).message).not.toContain(secret);

    const controller = new AbortController();
    controller.abort();
    const timeoutReader = new PublicBlogSnapshotReader({
      baseUrl: BASE_URL,
      fetchImpl: vi.fn(async () => { throw new Error(secret); }) as typeof fetch,
      timeoutSignalFactory: () => controller.signal,
    });
    await expect(timeoutReader.getManifest()).rejects.toThrow('request timed out');
  });
});
