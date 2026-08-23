/**
 * Strict public contract for a source-independent snapshot of published blog
 * content. The post/category field names intentionally mirror the public DTOs
 * in lib/blog/queries.ts; Date values are represented as canonical UTC ISO
 * strings at the storage boundary.
 */

export const PUBLIC_BLOG_MANIFEST_SCHEMA = 'naezip.public-blog.manifest.v1' as const;
export const PUBLIC_BLOG_PAYLOAD_SCHEMA = 'naezip.public-blog.payload.v1' as const;
export const PUBLIC_BLOG_SNAPSHOT_PREFIX = 'public-blog/v1' as const;
export const PUBLIC_BLOG_MANIFEST_KEY = `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/manifest.json` as const;
export const PUBLIC_BLOG_MAX_MANIFEST_BYTES = 64 * 1024;
export const PUBLIC_BLOG_MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
export const PUBLIC_BLOG_MAX_POSTS = 10_000;
export const PUBLIC_BLOG_MAX_CATEGORIES = 1_000;

const RELEASE_ID_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export interface PublicBlogSnapshotCategory {
  id: string;
  slug: string;
  name: string;
}

/** Exact persisted counterpart of PublicPostDetail, with Date -> UTC ISO. */
export interface PublicBlogSnapshotPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  publishedAt: string;
  categorySlug: string | null;
  categoryName: string | null;
  mdxContent: string;
  updatedAt: string;
}

export interface PublicBlogSnapshotPayload {
  schema: typeof PUBLIC_BLOG_PAYLOAD_SCHEMA;
  releaseId: string;
  generatedAt: string;
  categories: PublicBlogSnapshotCategory[];
  posts: PublicBlogSnapshotPost[];
}

export interface PublicBlogPayloadDescriptor {
  key: string;
  schema: typeof PUBLIC_BLOG_PAYLOAD_SCHEMA;
  contentType: 'application/json';
  sha256: string;
  byteLength: number;
  postCount: number;
  categoryCount: number;
}

export interface PublicBlogSnapshotManifest {
  schema: typeof PUBLIC_BLOG_MANIFEST_SCHEMA;
  releaseId: string;
  publishedAt: string;
  payload: PublicBlogPayloadDescriptor;
}

export class PublicBlogSnapshotValidationError extends Error {
  readonly issues: readonly string[];

  constructor(label: string, issues: readonly string[]) {
    super(`${label} validation failed: ${issues.join('; ')}`);
    this.name = 'PublicBlogSnapshotValidationError';
    this.issues = issues;
  }
}

const CATEGORY_KEYS = ['id', 'name', 'slug'] as const;
const POST_KEYS = [
  'categoryName', 'categorySlug', 'coverImageUrl', 'excerpt', 'id', 'mdxContent',
  'publishedAt', 'slug', 'title', 'updatedAt',
] as const;
const PAYLOAD_KEYS = ['categories', 'generatedAt', 'posts', 'releaseId', 'schema'] as const;
const DESCRIPTOR_KEYS = [
  'byteLength', 'categoryCount', 'contentType', 'key', 'postCount', 'schema', 'sha256',
] as const;
const MANIFEST_KEYS = ['payload', 'publishedAt', 'releaseId', 'schema'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  path: string,
  issues: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  if (missing.length) issues.push(`${path} is missing required fields`);
  if (extra.length) issues.push(`${path} contains forbidden fields`);
  return missing.length === 0 && extra.length === 0;
}

function canonicalText(
  value: unknown,
  path: string,
  issues: string[],
  maximum: number,
  allowEmpty = false,
): value is string {
  if (typeof value !== 'string'
    || value.length > maximum
    || (!allowEmpty && value.trim().length === 0)) {
    issues.push(`${path} must be a valid string`);
    return false;
  }
  return true;
}

function canonicalId(value: unknown, path: string, issues: string[]): value is string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    issues.push(`${path} must be a canonical lowercase UUID`);
    return false;
  }
  return true;
}

function canonicalSlug(value: unknown, path: string, issues: string[]): value is string {
  if (typeof value !== 'string' || value.length > 200 || !SLUG_PATTERN.test(value)) {
    issues.push(`${path} must be a canonical slug`);
    return false;
  }
  return true;
}

function canonicalTimestamp(
  value: unknown,
  path: string,
  issues: string[],
  now: Date,
): value is string {
  if (typeof value !== 'string' || !UTC_ISO_PATTERN.test(value)) {
    issues.push(`${path} must be a canonical UTC ISO timestamp`);
    return false;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    issues.push(`${path} must be a canonical UTC ISO timestamp`);
    return false;
  }
  if (timestamp > now.getTime()) {
    issues.push(`${path} must not be in the future`);
    return false;
  }
  return true;
}

function validNow(now: Date): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new PublicBlogSnapshotValidationError('clock', ['now must be a valid Date']);
  }
  return now;
}

function releaseTimestampPrefix(timestamp: string): string {
  return timestamp
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function canonicalReleaseId(
  value: unknown,
  timestamp: unknown,
  path: string,
  issues: string[],
): value is string {
  if (typeof value !== 'string' || !RELEASE_ID_PATTERN.test(value)) {
    issues.push(`${path} must be a canonical release ID`);
    return false;
  }
  if (typeof timestamp === 'string' && UTC_ISO_PATTERN.test(timestamp)
    && !value.startsWith(`${releaseTimestampPrefix(timestamp)}-`)) {
    issues.push(`${path} timestamp must match the publication timestamp`);
    return false;
  }
  return true;
}

function safeCoverImageUrl(value: unknown, path: string, issues: string[]): void {
  if (value === null) return;
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) {
    issues.push(`${path} must be null or a safe public HTTPS URL`);
    return;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      issues.push(`${path} must be null or a safe public HTTPS URL`);
    }
  } catch {
    issues.push(`${path} must be null or a safe public HTTPS URL`);
  }
}

function nullableText(value: unknown, path: string, issues: string[], maximum: number): void {
  if (value !== null) canonicalText(value, path, issues, maximum, true);
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical post order: publishedAt descending, then slug ascending. */
export function comparePublicBlogSnapshotPosts(
  left: Pick<PublicBlogSnapshotPost, 'publishedAt' | 'slug'>,
  right: Pick<PublicBlogSnapshotPost, 'publishedAt' | 'slug'>,
): number {
  const timestampOrder = Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  return timestampOrder || compareAscii(left.slug, right.slug);
}

export function serializePublicBlogTimestamp(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new PublicBlogSnapshotValidationError('timestamp', ['Date must be valid']);
  }
  return value.toISOString();
}

export function assertPublicBlogSnapshotManifest(
  value: unknown,
  options: { now?: Date } = {},
): asserts value is PublicBlogSnapshotManifest {
  const issues: string[] = [];
  const now = validNow(options.now ?? new Date());
  if (!exactRecord(value, MANIFEST_KEYS, 'manifest', issues)) {
    throw new PublicBlogSnapshotValidationError('manifest', issues);
  }
  if (value.schema !== PUBLIC_BLOG_MANIFEST_SCHEMA) issues.push('manifest.schema is unsupported');
  canonicalTimestamp(value.publishedAt, 'manifest.publishedAt', issues, now);
  canonicalReleaseId(value.releaseId, value.publishedAt, 'manifest.releaseId', issues);

  if (exactRecord(value.payload, DESCRIPTOR_KEYS, 'manifest.payload', issues)) {
    const descriptor = value.payload;
    if (descriptor.schema !== PUBLIC_BLOG_PAYLOAD_SCHEMA) {
      issues.push('manifest.payload.schema is unsupported');
    }
    if (descriptor.contentType !== 'application/json') {
      issues.push('manifest.payload.contentType is unsupported');
    }
    if (typeof descriptor.sha256 !== 'string' || !SHA256_PATTERN.test(descriptor.sha256)) {
      issues.push('manifest.payload.sha256 must be lowercase SHA-256');
    }
    if (!Number.isSafeInteger(descriptor.byteLength)
      || (descriptor.byteLength as number) < 1
      || (descriptor.byteLength as number) > PUBLIC_BLOG_MAX_PAYLOAD_BYTES) {
      issues.push('manifest.payload.byteLength is invalid');
    }
    if (!Number.isSafeInteger(descriptor.postCount)
      || (descriptor.postCount as number) < 0
      || (descriptor.postCount as number) > PUBLIC_BLOG_MAX_POSTS) {
      issues.push('manifest.payload.postCount is invalid');
    }
    if (!Number.isSafeInteger(descriptor.categoryCount)
      || (descriptor.categoryCount as number) < 0
      || (descriptor.categoryCount as number) > PUBLIC_BLOG_MAX_CATEGORIES) {
      issues.push('manifest.payload.categoryCount is invalid');
    }
    const expectedKey = typeof value.releaseId === 'string'
      ? `${PUBLIC_BLOG_SNAPSHOT_PREFIX}/releases/${value.releaseId}/payload.json`
      : '';
    if (descriptor.key !== expectedKey) issues.push('manifest.payload.key is not pinned to its release');
  }
  if (issues.length) throw new PublicBlogSnapshotValidationError('manifest', issues);
}

export function assertPublicBlogSnapshotPayload(
  value: unknown,
  options: { now?: Date } = {},
): asserts value is PublicBlogSnapshotPayload {
  const issues: string[] = [];
  const now = validNow(options.now ?? new Date());
  if (!exactRecord(value, PAYLOAD_KEYS, 'payload', issues)) {
    throw new PublicBlogSnapshotValidationError('payload', issues);
  }
  if (value.schema !== PUBLIC_BLOG_PAYLOAD_SCHEMA) issues.push('payload.schema is unsupported');
  canonicalTimestamp(value.generatedAt, 'payload.generatedAt', issues, now);
  canonicalReleaseId(value.releaseId, value.generatedAt, 'payload.releaseId', issues);
  if (!Array.isArray(value.categories)
    || value.categories.length > PUBLIC_BLOG_MAX_CATEGORIES) {
    issues.push('payload.categories must be a bounded array');
  }
  if (!Array.isArray(value.posts)
    || value.posts.length > PUBLIC_BLOG_MAX_POSTS) {
    issues.push('payload.posts must be a bounded array');
  }
  if (Array.isArray(value.posts)
    && value.posts.length === 0
    && Array.isArray(value.categories)
    && value.categories.length !== 0) {
    issues.push('an empty payload must not contain categories');
  }
  if (issues.length) throw new PublicBlogSnapshotValidationError('payload', issues);
  const categoryValues = value.categories as unknown[];
  const postValues = value.posts as unknown[];

  const categoryIds = new Set<string>();
  const categorySlugs = new Set<string>();
  const categoryBySlug = new Map<string, PublicBlogSnapshotCategory>();
  let previousCategorySlug: string | null = null;
  categoryValues.forEach((candidate, index) => {
    const path = `payload.categories[${index}]`;
    if (!exactRecord(candidate, CATEGORY_KEYS, path, issues)) return;
    const id = candidate.id;
    const slug = candidate.slug;
    const name = candidate.name;
    const idValid = canonicalId(id, `${path}.id`, issues);
    const slugValid = canonicalSlug(slug, `${path}.slug`, issues);
    const nameValid = canonicalText(name, `${path}.name`, issues, 200);
    if (idValid && categoryIds.has(id)) issues.push('category IDs must be unique');
    if (slugValid && categorySlugs.has(slug)) issues.push('category slugs must be unique');
    if (idValid) categoryIds.add(id);
    if (slugValid) {
      if (previousCategorySlug !== null && compareAscii(previousCategorySlug, slug) >= 0) {
        issues.push('categories must be strictly ordered by slug');
      }
      previousCategorySlug = slug;
      categorySlugs.add(slug);
      if (idValid && nameValid) {
        categoryBySlug.set(slug, { id, slug, name });
      }
    }
  });

  const postIds = new Set<string>();
  const postSlugs = new Set<string>();
  const generatedAtTimestamp = Date.parse(value.generatedAt as string);
  let previousPost: PublicBlogSnapshotPost | null = null;
  postValues.forEach((candidate, index) => {
    const path = `payload.posts[${index}]`;
    if (!exactRecord(candidate, POST_KEYS, path, issues)) return;
    const id = candidate.id;
    const slug = candidate.slug;
    const idValid = canonicalId(id, `${path}.id`, issues);
    const slugValid = canonicalSlug(slug, `${path}.slug`, issues);
    canonicalText(candidate.title, `${path}.title`, issues, 500);
    canonicalText(candidate.mdxContent, `${path}.mdxContent`, issues, 2_000_000);
    nullableText(candidate.excerpt, `${path}.excerpt`, issues, 5_000);
    safeCoverImageUrl(candidate.coverImageUrl, `${path}.coverImageUrl`, issues);
    const publishedAt = candidate.publishedAt;
    const updatedAt = candidate.updatedAt;
    const publishedAtValid = canonicalTimestamp(
      publishedAt,
      `${path}.publishedAt`,
      issues,
      now,
    );
    const updatedAtValid = canonicalTimestamp(updatedAt, `${path}.updatedAt`, issues, now);
    if (publishedAtValid && updatedAtValid) {
      const publishedAtTimestamp = Date.parse(publishedAt);
      const updatedAtTimestamp = Date.parse(updatedAt);
      if (publishedAtTimestamp > updatedAtTimestamp) {
        issues.push(`${path}.publishedAt must not be after updatedAt`);
      }
      if (updatedAtTimestamp > generatedAtTimestamp) {
        issues.push(`${path}.updatedAt must not be after payload.generatedAt`);
      }
    }
    if (idValid && postIds.has(id)) issues.push('post IDs must be unique');
    if (slugValid && postSlugs.has(slug)) issues.push('post slugs must be unique');
    if (idValid) postIds.add(id);
    if (slugValid) postSlugs.add(slug);

    const categoryPairIsNull = candidate.categorySlug === null && candidate.categoryName === null;
    const categoryPairIsString = typeof candidate.categorySlug === 'string'
      && typeof candidate.categoryName === 'string';
    if (!categoryPairIsNull && !categoryPairIsString) {
      issues.push(`${path} category slug/name must both be null or both be strings`);
    } else if (categoryPairIsString) {
      if (canonicalSlug(candidate.categorySlug, `${path}.categorySlug`, issues)) {
        const category = categoryBySlug.get(candidate.categorySlug);
        if (!category || category.name !== candidate.categoryName) {
          issues.push(`${path} category must match payload.categories`);
        }
      }
    }

    const post = candidate as unknown as PublicBlogSnapshotPost;
    if (previousPost && comparePublicBlogSnapshotPosts(previousPost, post) >= 0) {
      issues.push('posts must be strictly ordered by publishedAt descending then slug ascending');
    }
    previousPost = post;
  });

  if (issues.length) throw new PublicBlogSnapshotValidationError('payload', issues);
}

export function assertPublicBlogPayloadMatchesManifest(
  payload: PublicBlogSnapshotPayload,
  manifest: PublicBlogSnapshotManifest,
): void {
  const issues: string[] = [];
  if (payload.releaseId !== manifest.releaseId) issues.push('release IDs do not match');
  if (payload.generatedAt !== manifest.publishedAt) issues.push('publication timestamps do not match');
  if (payload.posts.length !== manifest.payload.postCount) issues.push('post count does not match');
  if (payload.categories.length !== manifest.payload.categoryCount) {
    issues.push('category count does not match');
  }
  if (issues.length) throw new PublicBlogSnapshotValidationError('payload binding', issues);
}
