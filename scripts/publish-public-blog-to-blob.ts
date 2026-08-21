import { config } from 'dotenv';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  createPublicBlogBlobStoreFromEnv,
  type PublicBlogRemoteObjectStore,
} from '../lib/blog-snapshots/blob-store';
import {
  isPublicBlogReleaseId,
  publishPublicBlogSnapshotToBlob,
} from '../lib/blog-snapshots/remote-publisher';
import { readTrustedPublicBlogSourceFile } from './publish-public-blog';

export const PUBLIC_BLOG_BLOB_PUBLISH_CLI_HELP = `
Usage: npm run blog:snapshot:publish -- \\
  --source <absolute-trusted-source.json> \\
  --confirm-release <reviewed-release-id> --confirm-production

Publishes a fully validated public blog release to the dedicated Vercel Blob
store, then verifies it through management and unauthenticated public reads.

--source <file>        Required absolute naezip.public-blog.source.v1 file.
--confirm-release <id> Required exact release ID from the reviewed dry-run.
--confirm-production   Required explicit remote-write confirmation.
--help, -h             Show this help.

Required environment:
  NAEZIP_BLOG_SNAPSHOT_BLOB_READ_WRITE_TOKEN
  NEXT_PUBLIC_BLOG_SNAPSHOT_BASE_URL
`;

export class PublicBlogBlobPublishCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBlogBlobPublishCliUsageError';
  }
}

export interface PublicBlogBlobPublishCliArguments {
  help: boolean;
  sourcePath: string | null;
  confirmRelease: string | null;
  confirmProduction: boolean;
}

function takeOptionValue(
  args: readonly string[],
  index: number,
  option: '--source' | '--confirm-release',
): { value: string; nextIndex: number } {
  const argument = args[index];
  const inlinePrefix = `${option}=`;
  if (argument.startsWith(inlinePrefix)) {
    const value = argument.slice(inlinePrefix.length);
    if (!value) throw new PublicBlogBlobPublishCliUsageError(`${option} requires a value`);
    return { value, nextIndex: index };
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new PublicBlogBlobPublishCliUsageError(`${option} requires a value`);
  }
  return { value, nextIndex: index + 1 };
}

export function parsePublicBlogBlobPublishCliArguments(
  args: readonly string[],
): PublicBlogBlobPublishCliArguments {
  let help = false;
  let sourcePath: string | null = null;
  let confirmRelease: string | null = null;
  let confirmProduction = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      if (help) throw new PublicBlogBlobPublishCliUsageError('Duplicate help option');
      help = true;
      continue;
    }
    if (argument === '--source' || argument.startsWith('--source=')) {
      if (sourcePath !== null) {
        throw new PublicBlogBlobPublishCliUsageError('Duplicate source option');
      }
      const parsed = takeOptionValue(args, index, '--source');
      sourcePath = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === '--confirm-release' || argument.startsWith('--confirm-release=')) {
      if (confirmRelease !== null) {
        throw new PublicBlogBlobPublishCliUsageError('Duplicate release confirmation');
      }
      const parsed = takeOptionValue(args, index, '--confirm-release');
      confirmRelease = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === '--confirm-production') {
      if (confirmProduction) {
        throw new PublicBlogBlobPublishCliUsageError('Duplicate production confirmation');
      }
      confirmProduction = true;
      continue;
    }
    // Unknown arguments can contain copied credentials; never echo one.
    throw new PublicBlogBlobPublishCliUsageError('Unknown public blog Blob publish option');
  }
  if (help && (sourcePath !== null || confirmRelease !== null || confirmProduction)) {
    throw new PublicBlogBlobPublishCliUsageError('Help cannot be combined with publish options');
  }
  if (!help && sourcePath === null) {
    throw new PublicBlogBlobPublishCliUsageError('--source is required');
  }
  if (!help && confirmRelease === null) {
    throw new PublicBlogBlobPublishCliUsageError('--confirm-release is required');
  }
  if (!help && !confirmProduction) {
    throw new PublicBlogBlobPublishCliUsageError('--confirm-production is required');
  }
  if (confirmRelease !== null && !isPublicBlogReleaseId(confirmRelease)) {
    throw new PublicBlogBlobPublishCliUsageError('--confirm-release is invalid');
  }
  if (sourcePath !== null && !path.isAbsolute(sourcePath)) {
    throw new PublicBlogBlobPublishCliUsageError('--source must be an absolute file path');
  }
  return { help, sourcePath, confirmRelease, confirmProduction };
}

export async function runPublicBlogBlobPublishCli(
  args: readonly string[],
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    store?: PublicBlogRemoteObjectStore;
    publicFetchImpl?: typeof fetch;
    now?: Date;
    log?: (message: string) => void;
  } = {},
): Promise<number> {
  const parsed = parsePublicBlogBlobPublishCliArguments(args);
  const log = options.log ?? console.log;
  if (parsed.help) {
    log(PUBLIC_BLOG_BLOB_PUBLISH_CLI_HELP.trim());
    return 0;
  }
  const env = options.env ?? process.env;
  const store = options.store ?? createPublicBlogBlobStoreFromEnv(env);
  const source = await readTrustedPublicBlogSourceFile(parsed.sourcePath!);
  const result = await publishPublicBlogSnapshotToBlob({
    source,
    expectedReleaseId: parsed.confirmRelease!,
    store,
    publicFetchImpl: options.publicFetchImpl,
    now: options.now,
  });
  log(
    `[public-blog-blob] complete: release=${result.releaseId}`
      + ` posts=${result.postCount} categories=${result.categoryCount}`
      + ' managementReadback=ok publicReadback=ok',
  );
  log(`[public-blog-blob] manifest: ${result.manifestUrl}`);
  return 0;
}

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const parsed = parsePublicBlogBlobPublishCliArguments(args);
    if (parsed.help) {
      console.log(PUBLIC_BLOG_BLOB_PUBLISH_CLI_HELP.trim());
      process.exitCode = 0;
      return;
    }
    const explicitEnvFile = process.env.NAEZIP_ENV_FILE;
    if (explicitEnvFile !== undefined
      && (!explicitEnvFile.trim() || !path.isAbsolute(explicitEnvFile))) {
      throw new PublicBlogBlobPublishCliUsageError('Public blog environment file is invalid');
    }
    const envFile = explicitEnvFile ?? path.resolve(process.cwd(), '.env.local');
    const loaded = config({ path: envFile, quiet: true });
    if (explicitEnvFile !== undefined && loaded.error) {
      throw new PublicBlogBlobPublishCliUsageError('Public blog environment file could not be loaded');
    }
    process.exitCode = await runPublicBlogBlobPublishCli(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown failure';
    console.error(`[public-blog-blob] failed: ${message}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (invokedDirectly) void main();
