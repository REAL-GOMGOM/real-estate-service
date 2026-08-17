import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  mkdir,
  lstat,
  open,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { validateMdxStrict } from '@/lib/blog/validate-mdx';
import { sha256Hex, stableJson } from '@/lib/public-snapshots/artifact';

import {
  PUBLIC_BLOG_MANIFEST_KEY,
  PUBLIC_BLOG_MANIFEST_SCHEMA,
  PUBLIC_BLOG_MAX_MANIFEST_BYTES,
  PUBLIC_BLOG_MAX_PAYLOAD_BYTES,
  PUBLIC_BLOG_PAYLOAD_SCHEMA,
  PUBLIC_BLOG_SNAPSHOT_PREFIX,
  PublicBlogSnapshotValidationError,
  assertPublicBlogPayloadMatchesManifest,
  assertPublicBlogSnapshotManifest,
  assertPublicBlogSnapshotPayload,
  comparePublicBlogSnapshotPosts,
  type PublicBlogSnapshotCategory,
  type PublicBlogSnapshotManifest,
  type PublicBlogSnapshotPayload,
  type PublicBlogSnapshotPost,
} from './contract';

export const PUBLIC_BLOG_SOURCE_SCHEMA = 'naezip.public-blog.source.v1' as const;
const PUBLIC_BLOG_PRODUCTION_MINIMUM_POSTS = 43;

export interface TrustedPublicBlogSnapshotSourcePost extends PublicBlogSnapshotPost {
  status: 'published';
}

/**
 * Explicit, portable hand-off format for a trusted source export.
 *
 * It deliberately contains `status` even though the public payload does not,
 * so a draft cannot enter the public snapshot through an implicit filter.
 */
export interface TrustedPublicBlogSnapshotSource {
  schema: typeof PUBLIC_BLOG_SOURCE_SCHEMA;
  generatedAt: string;
  categories: PublicBlogSnapshotCategory[];
  posts: TrustedPublicBlogSnapshotSourcePost[];
}

export interface BuildPublicBlogSnapshotOptions {
  now?: Date;
}

export interface BuiltPublicBlogSnapshotRelease {
  releaseId: string;
  payloadKey: string;
  releaseManifestKey: string;
  manifestKey: typeof PUBLIC_BLOG_MANIFEST_KEY;
  payload: PublicBlogSnapshotPayload;
  manifest: PublicBlogSnapshotManifest;
  payloadBody: Buffer;
  releaseManifestBody: Buffer;
  manifestBody: Buffer;
}

interface WritePublicBlogSnapshotDryRunOptions {
  outputDir: string;
  now?: Date;
}

interface WritePublicBlogSnapshotDryRunResult {
  outputDir: string;
  manifestUrl: string;
  writtenKeys: readonly [string, string, typeof PUBLIC_BLOG_MANIFEST_KEY];
}

export interface PublishPublicBlogSnapshotDryRunInput
  extends BuildPublicBlogSnapshotOptions, WritePublicBlogSnapshotDryRunOptions {
  source: unknown;
}

export interface PublishPublicBlogSnapshotDryRunResult
  extends BuiltPublicBlogSnapshotRelease, WritePublicBlogSnapshotDryRunResult {}

const SOURCE_KEYS = ['categories', 'generatedAt', 'posts', 'schema'] as const;
const SOURCE_CATEGORY_KEYS = ['id', 'name', 'slug'] as const;
const SOURCE_POST_KEYS = [
  'categoryName', 'categorySlug', 'coverImageUrl', 'excerpt', 'id', 'mdxContent',
  'publishedAt', 'slug', 'status', 'title', 'updatedAt',
] as const;
const CANONICAL_UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  pathLabel: string,
  issues: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push(`${pathLabel} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (expected.some((key) => !actual.includes(key))) {
    issues.push(`${pathLabel} is missing required fields`);
  }
  if (actual.some((key) => !expected.includes(key))) {
    issues.push(`${pathLabel} contains forbidden fields`);
  }
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function assertExactTrustedSourceShape(value: unknown): asserts value is TrustedPublicBlogSnapshotSource {
  const issues: string[] = [];
  if (!exactRecord(value, SOURCE_KEYS, 'source', issues)) {
    throw new PublicBlogSnapshotValidationError('source', issues);
  }
  if (value.schema !== PUBLIC_BLOG_SOURCE_SCHEMA) issues.push('source.schema is unsupported');
  if (!Array.isArray(value.categories)) {
    issues.push('source.categories must be an array');
  } else {
    value.categories.forEach((category, index) => {
      exactRecord(category, SOURCE_CATEGORY_KEYS, `source.categories[${index}]`, issues);
    });
  }
  if (!Array.isArray(value.posts)) {
    issues.push('source.posts must be an array');
  } else {
    value.posts.forEach((post, index) => {
      const exact = exactRecord(post, SOURCE_POST_KEYS, `source.posts[${index}]`, issues);
      if (exact && post.status !== 'published') {
        issues.push(`source.posts[${index}].status must equal published`);
      }
    });
  }
  if (issues.length) throw new PublicBlogSnapshotValidationError('source', issues);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortableString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sortSourcePosts(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): number {
  const leftPublishedAt = sortableString(left.publishedAt);
  const rightPublishedAt = sortableString(right.publishedAt);
  const leftTimestamp = Date.parse(leftPublishedAt);
  const rightTimestamp = Date.parse(rightPublishedAt);
  if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp)) {
    const timestampOrder = rightTimestamp - leftTimestamp;
    if (timestampOrder) return timestampOrder;
  } else {
    const rawTimestampOrder = compareAscii(rightPublishedAt, leftPublishedAt);
    if (rawTimestampOrder) return rawTimestampOrder;
  }
  return compareAscii(sortableString(left.slug), sortableString(right.slug));
}

function releaseTimestampPrefix(value: unknown): string {
  if (typeof value !== 'string'
    || !CANONICAL_UTC_ISO_PATTERN.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    return '19700101T000000Z';
  }
  return value.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function validNow(value: Date | undefined): Date {
  const now = value ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new PublicBlogSnapshotValidationError('clock', ['now must be a valid Date']);
  }
  return now;
}

function sourceAsCanonicalPayload(
  source: TrustedPublicBlogSnapshotSource,
  now: Date,
): PublicBlogSnapshotPayload {
  const categories = [...source.categories]
    .map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
    }))
    .sort((left, right) => compareAscii(sortableString(left.slug), sortableString(right.slug)));
  const posts = [...source.posts]
    .map((post) => ({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      coverImageUrl: post.coverImageUrl,
      publishedAt: post.publishedAt,
      categorySlug: post.categorySlug,
      categoryName: post.categoryName,
      mdxContent: post.mdxContent,
      updatedAt: post.updatedAt,
    }))
    .sort((left, right) => sortSourcePosts(left, right));
  const candidate: unknown = {
    schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
    releaseId: `${releaseTimestampPrefix(source.generatedAt)}-000000000000`,
    generatedAt: source.generatedAt,
    categories,
    posts,
  };
  try {
    assertPublicBlogSnapshotPayload(candidate, { now });
  } catch (error) {
    if (error instanceof PublicBlogSnapshotValidationError) {
      throw new PublicBlogSnapshotValidationError('source', error.issues);
    }
    throw error;
  }
  return candidate;
}

export function publicBlogReleasePayloadKey(releaseId: string): string {
  return `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/${releaseId}/payload.json`;
}

export function publicBlogReleaseManifestKey(releaseId: string): string {
  return `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/${releaseId}/manifest.json`;
}

/** Build and fully preflight a release without touching the filesystem. */
export async function buildPublicBlogSnapshotRelease(
  sourceValue: unknown,
  options: BuildPublicBlogSnapshotOptions = {},
): Promise<BuiltPublicBlogSnapshotRelease> {
  const now = validNow(options.now);
  assertExactTrustedSourceShape(sourceValue);
  const canonical = sourceAsCanonicalPayload(sourceValue, now);
  if (canonical.posts.length < PUBLIC_BLOG_PRODUCTION_MINIMUM_POSTS) {
    throw new PublicBlogSnapshotValidationError('source policy', [
      `at least ${PUBLIC_BLOG_PRODUCTION_MINIMUM_POSTS} published posts are required`,
    ]);
  }

  for (const [index, post] of canonical.posts.entries()) {
    const validation = await validateMdxStrict(post.mdxContent);
    if (!validation.ok) {
      throw new PublicBlogSnapshotValidationError('source MDX', [
        `post at canonical index ${index} failed strict MDX preflight`,
      ]);
    }
  }

  const releaseDigest = sha256Hex(stableJson({
    schema: canonical.schema,
    generatedAt: canonical.generatedAt,
    categories: canonical.categories,
    posts: canonical.posts,
  })).slice(0, 12);
  const releaseId = `${releaseTimestampPrefix(canonical.generatedAt)}-${releaseDigest}`;
  const payload: PublicBlogSnapshotPayload = {
    ...canonical,
    releaseId,
    categories: [...canonical.categories],
    posts: [...canonical.posts].sort(comparePublicBlogSnapshotPosts),
  };
  assertPublicBlogSnapshotPayload(payload, { now });
  const payloadBody = Buffer.from(stableJson(payload), 'utf8');
  if (payloadBody.byteLength > PUBLIC_BLOG_MAX_PAYLOAD_BYTES) {
    throw new PublicBlogSnapshotValidationError('payload', ['payload exceeds its byte limit']);
  }
  const payloadKey = publicBlogReleasePayloadKey(releaseId);
  const manifest: PublicBlogSnapshotManifest = {
    schema: PUBLIC_BLOG_MANIFEST_SCHEMA,
    releaseId,
    publishedAt: payload.generatedAt,
    payload: {
      key: payloadKey,
      schema: PUBLIC_BLOG_PAYLOAD_SCHEMA,
      contentType: 'application/json',
      sha256: sha256Hex(payloadBody),
      byteLength: payloadBody.byteLength,
      postCount: payload.posts.length,
      categoryCount: payload.categories.length,
    },
  };
  assertPublicBlogSnapshotManifest(manifest, { now });
  assertPublicBlogPayloadMatchesManifest(payload, manifest);
  const manifestBody = Buffer.from(stableJson(manifest), 'utf8');
  if (manifestBody.byteLength > PUBLIC_BLOG_MAX_MANIFEST_BYTES) {
    throw new PublicBlogSnapshotValidationError('manifest', ['manifest exceeds its byte limit']);
  }
  return {
    releaseId,
    payloadKey,
    releaseManifestKey: publicBlogReleaseManifestKey(releaseId),
    manifestKey: PUBLIC_BLOG_MANIFEST_KEY,
    payload,
    manifest,
    payloadBody,
    releaseManifestBody: Buffer.from(manifestBody),
    manifestBody,
  };
}

function parseCanonicalJson(body: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new PublicBlogSnapshotValidationError(label, ['body is not valid UTF-8 JSON']);
  }
}

function assertBuiltReleaseIntegrity(
  release: BuiltPublicBlogSnapshotRelease,
  now: Date,
): void {
  if (release.payloadKey !== publicBlogReleasePayloadKey(release.releaseId)
    || release.releaseManifestKey !== publicBlogReleaseManifestKey(release.releaseId)
    || release.manifestKey !== PUBLIC_BLOG_MANIFEST_KEY) {
    throw new PublicBlogSnapshotValidationError('local release', ['object keys are invalid']);
  }
  const payloadValue = parseCanonicalJson(release.payloadBody, 'payload');
  const manifestValue = parseCanonicalJson(release.manifestBody, 'manifest');
  assertPublicBlogSnapshotPayload(payloadValue, { now });
  assertPublicBlogSnapshotManifest(manifestValue, { now });
  assertPublicBlogPayloadMatchesManifest(payloadValue, manifestValue);
  if (stableJson(payloadValue) !== release.payloadBody.toString('utf8')
    || stableJson(manifestValue) !== release.manifestBody.toString('utf8')
    || !release.releaseManifestBody.equals(release.manifestBody)
    || manifestValue.releaseId !== release.releaseId
    || manifestValue.payload.key !== release.payloadKey
    || manifestValue.payload.byteLength !== release.payloadBody.byteLength
    || manifestValue.payload.sha256 !== sha256Hex(release.payloadBody)) {
    throw new PublicBlogSnapshotValidationError('local release', [
      'release bytes do not match their validated manifest',
    ]);
  }
}

function safeDestination(rootDir: string, key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(key)
    || key.startsWith('/')
    || key.includes('..')
    || key.includes('\\')) {
    throw new PublicBlogSnapshotValidationError('local release', ['object key is unsafe']);
  }
  const destination = path.resolve(rootDir, key);
  if (!destination.startsWith(`${rootDir}${path.sep}`)) {
    throw new PublicBlogSnapshotValidationError('local release', ['object key escaped output directory']);
  }
  return destination;
}

function isFsErrorWithCode(error: unknown, codes: readonly string[]): boolean {
  return error instanceof Error
    && 'code' in error
    && typeof error.code === 'string'
    && codes.includes(error.code);
}

async function writeDurableNewFile(destination: string, body: Uint8Array): Promise<void> {
  const handle = await open(destination, 'wx', 0o600);
  try {
    await handle.writeFile(body);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertExistingFile(destination: string, expected: Uint8Array): Promise<void> {
  let handle;
  try {
    handle = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new PublicBlogSnapshotValidationError('local release', [
      'existing immutable release is invalid',
    ]);
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size !== expected.byteLength) {
      throw new PublicBlogSnapshotValidationError('local release', [
        'existing immutable release is invalid',
      ]);
    }
    const existing = Buffer.allocUnsafe(expected.byteLength + 1);
    let byteLength = 0;
    while (byteLength < existing.byteLength) {
      const { bytesRead } = await handle.read(
        existing,
        byteLength,
        existing.byteLength - byteLength,
        null,
      );
      if (bytesRead === 0) break;
      byteLength += bytesRead;
    }
    if (byteLength !== expected.byteLength
      || sha256Hex(existing.subarray(0, byteLength)) !== sha256Hex(expected)) {
      throw new PublicBlogSnapshotValidationError('local release', [
        'existing immutable release is invalid',
      ]);
    }
  } catch (error) {
    if (error instanceof PublicBlogSnapshotValidationError) throw error;
    throw new Error('Local blog snapshot immutable read failed');
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function assertDirectoryIsReal(directory: string): Promise<void> {
  let metadata;
  try {
    metadata = await lstat(directory);
  } catch (error) {
    if (isFsErrorWithCode(error, ['ENOENT'])) {
      throw new PublicBlogSnapshotValidationError('local release', [
        'expected output directory is absent',
      ]);
    }
    throw new Error('Local blog snapshot output inspection failed');
  }
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new PublicBlogSnapshotValidationError('local release', [
      'output hierarchy must contain real directories only',
    ]);
  }
}

async function ensureSafeOutputHierarchy(outputDir: string): Promise<string> {
  try {
    await mkdir(outputDir, { recursive: true, mode: 0o700 });
  } catch {
    throw new Error('Local blog snapshot output directory creation failed');
  }
  await assertDirectoryIsReal(outputDir);

  let current = outputDir;
  for (const segment of PUBLIC_BLOG_SNAPSHOT_PREFIX.split('/')) {
    current = path.join(current, segment);
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (!isFsErrorWithCode(error, ['EEXIST'])) {
        throw new Error('Local blog snapshot output directory creation failed');
      }
    }
    await assertDirectoryIsReal(current);
  }
  return current;
}

async function installImmutableReleaseDirectory(
  outputDir: string,
  release: BuiltPublicBlogSnapshotRelease,
): Promise<void> {
  const releaseDirectory = path.dirname(safeDestination(outputDir, release.payloadKey));
  const releasesDirectory = path.dirname(releaseDirectory);
  try {
    await mkdir(releasesDirectory, { mode: 0o700 });
  } catch (error) {
    if (!isFsErrorWithCode(error, ['EEXIST'])) {
      throw new Error('Local blog snapshot release directory creation failed');
    }
  }
  await assertDirectoryIsReal(releasesDirectory);
  const stageDirectory = path.join(
    releasesDirectory,
    `.${release.releaseId}.tmp-${process.pid}-${randomUUID()}`,
  );
  await mkdir(stageDirectory, { mode: 0o700 });
  try {
    await writeDurableNewFile(path.join(stageDirectory, 'payload.json'), release.payloadBody);
    await writeDurableNewFile(
      path.join(stageDirectory, 'manifest.json'),
      release.releaseManifestBody,
    );
    try {
      await rename(stageDirectory, releaseDirectory);
      return;
    } catch (error) {
      if (!isFsErrorWithCode(error, ['EEXIST', 'ENOTEMPTY'])) throw error;
    }
    await assertDirectoryIsReal(releaseDirectory);
    await assertExistingFile(path.join(releaseDirectory, 'payload.json'), release.payloadBody);
    await assertExistingFile(
      path.join(releaseDirectory, 'manifest.json'),
      release.releaseManifestBody,
    );
  } finally {
    await rm(stageDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function replaceManifestPointerAtomically(
  outputDir: string,
  release: BuiltPublicBlogSnapshotRelease,
): Promise<void> {
  const destination = safeDestination(outputDir, PUBLIC_BLOG_MANIFEST_KEY);
  await assertDirectoryIsReal(path.dirname(destination));
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeDurableNewFile(temporary, release.manifestBody);
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

/**
 * Persist only to a local dry-run directory. The immutable release directory
 * is installed atomically, then the mutable discovery manifest is replaced
 * last. No remote store implementation is accepted by this API.
 */
async function writePublicBlogSnapshotDryRun(
  release: BuiltPublicBlogSnapshotRelease,
  options: WritePublicBlogSnapshotDryRunOptions,
): Promise<WritePublicBlogSnapshotDryRunResult> {
  const now = validNow(options.now);
  assertBuiltReleaseIntegrity(release, now);
  const outputDir = path.resolve(options.outputDir);
  if (outputDir === path.parse(outputDir).root) {
    throw new PublicBlogSnapshotValidationError('local release', [
      'filesystem root cannot be used as the output directory',
    ]);
  }
  try {
    await ensureSafeOutputHierarchy(outputDir);
    await installImmutableReleaseDirectory(outputDir, release);
    await replaceManifestPointerAtomically(outputDir, release);
    const manifestPath = safeDestination(outputDir, PUBLIC_BLOG_MANIFEST_KEY);
    return {
      outputDir,
      manifestUrl: pathToFileURL(manifestPath).toString(),
      writtenKeys: [release.payloadKey, release.releaseManifestKey, PUBLIC_BLOG_MANIFEST_KEY],
    };
  } catch (error) {
    if (error instanceof PublicBlogSnapshotValidationError) throw error;
    throw new Error('Local public blog snapshot write failed');
  }
}

export async function publishPublicBlogSnapshotDryRun(
  input: PublishPublicBlogSnapshotDryRunInput,
): Promise<PublishPublicBlogSnapshotDryRunResult> {
  const release = await buildPublicBlogSnapshotRelease(input.source, {
    now: input.now,
  });
  const writeResult = await writePublicBlogSnapshotDryRun(release, {
    outputDir: input.outputDir,
    now: input.now,
  });
  return { ...release, ...writeResult };
}
