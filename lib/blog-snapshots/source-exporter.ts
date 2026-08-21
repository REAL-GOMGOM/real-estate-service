import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  open,
  rename,
  rm,
} from 'node:fs/promises';
import path from 'node:path';

import { stableJson } from '@/lib/public-snapshots/artifact';

import {
  PUBLIC_BLOG_SOURCE_SCHEMA,
  buildPublicBlogSnapshotRelease,
} from './publisher';
import { PublicBlogSnapshotValidationError } from './contract';

/**
 * One read-only statement returns a transaction-consistent export. Categories
 * are derived exclusively from published posts, so draft-only taxonomy never
 * enters the public hand-off file.
 */
export const PUBLIC_BLOG_SOURCE_SELECT = `
WITH published_posts AS MATERIALIZED (
  SELECT
    p.id::text AS id,
    p.slug,
    p.title,
    p.excerpt,
    p.cover_image_url,
    p.published_at,
    p.mdx_content,
    p.updated_at,
    p.status::text AS status,
    c.id::text AS category_id,
    c.slug AS category_slug,
    c.name AS category_name
  FROM posts AS p
  LEFT JOIN categories AS c ON c.id = p.category_id
  WHERE p.status = 'published'
),
published_categories AS (
  SELECT DISTINCT
    category_id AS id,
    category_slug AS slug,
    category_name AS name
  FROM published_posts
  WHERE category_id IS NOT NULL
)
SELECT
  transaction_timestamp() AS "generatedAt",
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', category.id,
        'slug', category.slug,
        'name', category.name
      ) ORDER BY category.slug ASC
    )
    FROM published_categories AS category
  ), '[]'::jsonb) AS categories,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', post.id,
        'slug', post.slug,
        'title', post.title,
        'excerpt', post.excerpt,
        'coverImageUrl', post.cover_image_url,
        'publishedAt', post.published_at,
        'categorySlug', post.category_slug,
        'categoryName', post.category_name,
        'mdxContent', post.mdx_content,
        'updatedAt', post.updated_at,
        'status', post.status
      ) ORDER BY post.published_at DESC, post.slug ASC
    )
    FROM published_posts AS post
  ), '[]'::jsonb) AS posts
`.trim();

export interface PublicBlogSourceQueryClient {
  query(queryText: string, params?: readonly unknown[]): Promise<readonly unknown[]>;
}

export interface ExportPublicBlogSourceInput {
  queryClient: PublicBlogSourceQueryClient;
  /** An explicit absolute file path. Its parent directory must already exist. */
  outputPath: string;
  /** Validation clock injection for deterministic tests. */
  now?: Date;
}

export interface ExportPublicBlogSourceResult {
  outputPath: string;
  releaseId: string;
  postCount: number;
  categoryCount: number;
}

export class PublicBlogSourceExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBlogSourceExportError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalQueryTimestamp(value: unknown): unknown {
  if (!(value instanceof Date) && typeof value !== 'string') return value;
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Date(timestamp).toISOString();
}

function exactQueryRow(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  return keys.length === 3
    && keys[0] === 'categories'
    && keys[1] === 'generatedAt'
    && keys[2] === 'posts';
}

function normalizeQueryPost(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    publishedAt: canonicalQueryTimestamp(value.publishedAt),
    updatedAt: canonicalQueryTimestamp(value.updatedAt),
  };
}

function sourceFromQueryRow(value: unknown): unknown {
  if (!exactQueryRow(value)) {
    throw new PublicBlogSourceExportError('Public blog source query result is invalid');
  }
  return {
    schema: PUBLIC_BLOG_SOURCE_SCHEMA,
    generatedAt: canonicalQueryTimestamp(value.generatedAt),
    categories: value.categories,
    posts: Array.isArray(value.posts)
      ? value.posts.map(normalizeQueryPost)
      : value.posts,
  };
}

function assertExplicitOutputPath(outputPath: string): string {
  if (typeof outputPath !== 'string'
    || outputPath.trim() !== outputPath
    || !path.isAbsolute(outputPath)
    || outputPath === path.parse(outputPath).root) {
    throw new PublicBlogSourceExportError(
      'Public blog source output must be an explicit absolute file path',
    );
  }
  return path.normalize(outputPath);
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ENOENT';
}

async function assertRealParentDirectory(parentDirectory: string): Promise<{
  dev: number;
  ino: number;
}> {
  const metadata = await lstat(parentDirectory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new PublicBlogSourceExportError('Public blog source output parent is unsafe');
  }
  return { dev: metadata.dev, ino: metadata.ino };
}

async function assertReplaceableRegularFile(destination: string): Promise<void> {
  let metadata;
  try {
    metadata = await lstat(destination);
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw error;
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new PublicBlogSourceExportError(
      'Public blog source output must be absent or a regular file',
    );
  }
}

async function writeAtomicPrivateFile(destination: string, body: Uint8Array): Promise<void> {
  const parentDirectory = path.dirname(destination);
  const temporary = path.join(
    parentDirectory,
    `.${path.basename(destination)}.tmp-${process.pid}-${randomUUID()}`,
  );
  try {
    const parentIdentity = await assertRealParentDirectory(parentDirectory);
    await assertReplaceableRegularFile(destination);

    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.chmod(0o600);
      await handle.writeFile(body);
      await handle.sync();
    } finally {
      await handle.close();
    }

    const currentParent = await assertRealParentDirectory(parentDirectory);
    if (currentParent.dev !== parentIdentity.dev || currentParent.ino !== parentIdentity.ino) {
      throw new PublicBlogSourceExportError('Public blog source output parent changed during write');
    }
    // Recheck without following the destination. If a symlink appeared during
    // validation, abort; rename itself must only ever replace a regular file.
    await assertReplaceableRegularFile(destination);
    await rename(temporary, destination);

    const installed = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await installed.stat();
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
        throw new PublicBlogSourceExportError('Public blog source output verification failed');
      }
    } finally {
      await installed.close();
    }

    const directory = await open(
      parentDirectory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    if (error instanceof PublicBlogSourceExportError) throw error;
    throw new PublicBlogSourceExportError('Public blog source export write failed');
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

/**
 * Query, validate, then atomically install one trusted source hand-off file.
 * No filesystem write begins until the complete 43+ post release passes the
 * same strict validation used by the offline snapshot publisher.
 */
export async function exportPublicBlogSource(
  input: ExportPublicBlogSourceInput,
): Promise<ExportPublicBlogSourceResult> {
  const outputPath = assertExplicitOutputPath(input.outputPath);
  let rows: readonly unknown[];
  try {
    rows = await input.queryClient.query(PUBLIC_BLOG_SOURCE_SELECT, []);
  } catch {
    throw new PublicBlogSourceExportError('Public blog source query failed');
  }
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new PublicBlogSourceExportError('Public blog source query result is invalid');
  }

  const source = sourceFromQueryRow(rows[0]);
  let release;
  try {
    release = await buildPublicBlogSnapshotRelease(source, {
      now: input.now ?? new Date(),
    });
  } catch (error) {
    if (error instanceof PublicBlogSnapshotValidationError) throw error;
    throw new PublicBlogSourceExportError('Public blog source validation failed');
  }

  await writeAtomicPrivateFile(
    outputPath,
    Buffer.from(stableJson(source), 'utf8'),
  );
  return {
    outputPath,
    releaseId: release.releaseId,
    postCount: release.payload.posts.length,
    categoryCount: release.payload.categories.length,
  };
}
