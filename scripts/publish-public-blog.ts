import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { PUBLIC_BLOG_MAX_PAYLOAD_BYTES } from '../lib/blog-snapshots/contract';
import { publishPublicBlogSnapshotDryRun } from '../lib/blog-snapshots/publisher';

const DEFAULT_OUTPUT_DIRECTORY = '.local/public-blog-snapshot-dry-run';
const MAX_SOURCE_BYTES = PUBLIC_BLOG_MAX_PAYLOAD_BYTES + 2 * 1024 * 1024;

export const PUBLIC_BLOG_SNAPSHOT_CLI_HELP = `
Usage: npm run blog:snapshot:dry-run -- --source <trusted-source.json> [--output <directory>]
  [--confirm-empty-bootstrap | --confirm-bootstrap-continuation]

Builds a deterministic public blog snapshot in a local directory only. It never
opens a network connection, reads a database, uploads to Blob, or changes a
runtime environment variable.

--source <file>       Required trusted naezip.public-blog.source.v1 JSON export.
--output <directory>  Local output root (default: ${DEFAULT_OUTPUT_DIRECTORY}).
--confirm-empty-bootstrap
                      Explicitly build a one-time zero-post, zero-category reset.
--confirm-bootstrap-continuation
                      Explicitly build a 1..43 post bootstrap continuation.
--help, -h            Show this help.

Production safety policy requires at least 43 posts and every source post must
explicitly have status="published". The empty-bootstrap flag does not lower that
floor: it accepts only exactly zero posts and zero categories.
`;

export class PublicBlogSnapshotCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBlogSnapshotCliUsageError';
  }
}

export interface PublicBlogSnapshotCliArguments {
  help: boolean;
  sourcePath: string | null;
  outputDir: string;
  confirmEmptyBootstrap: boolean;
  confirmBootstrapContinuation: boolean;
}

function takeOptionValue(
  args: readonly string[],
  index: number,
  option: '--source' | '--output',
): { value: string; nextIndex: number } {
  const argument = args[index];
  const inlinePrefix = `${option}=`;
  if (argument.startsWith(inlinePrefix)) {
    const value = argument.slice(inlinePrefix.length);
    if (!value) throw new PublicBlogSnapshotCliUsageError(`${option} requires a value`);
    return { value, nextIndex: index };
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new PublicBlogSnapshotCliUsageError(`${option} requires a value`);
  }
  return { value, nextIndex: index + 1 };
}

export function parsePublicBlogSnapshotCliArguments(
  args: readonly string[],
): PublicBlogSnapshotCliArguments {
  let help = false;
  let sourcePath: string | null = null;
  let outputDir = DEFAULT_OUTPUT_DIRECTORY;
  let outputSeen = false;
  let confirmEmptyBootstrap = false;
  let confirmBootstrapContinuation = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      if (help) throw new PublicBlogSnapshotCliUsageError('Duplicate help option');
      help = true;
      continue;
    }
    if (argument === '--source' || argument.startsWith('--source=')) {
      if (sourcePath !== null) {
        throw new PublicBlogSnapshotCliUsageError('Duplicate source option');
      }
      const parsed = takeOptionValue(args, index, '--source');
      sourcePath = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === '--output' || argument.startsWith('--output=')) {
      if (outputSeen) throw new PublicBlogSnapshotCliUsageError('Duplicate output option');
      const parsed = takeOptionValue(args, index, '--output');
      outputDir = parsed.value;
      outputSeen = true;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === '--confirm-empty-bootstrap') {
      if (confirmEmptyBootstrap) {
        throw new PublicBlogSnapshotCliUsageError('Duplicate empty bootstrap confirmation');
      }
      confirmEmptyBootstrap = true;
      continue;
    }
    if (argument === '--confirm-bootstrap-continuation') {
      if (confirmBootstrapContinuation) {
        throw new PublicBlogSnapshotCliUsageError(
          'Duplicate bootstrap continuation confirmation',
        );
      }
      confirmBootstrapContinuation = true;
      continue;
    }
    // Do not echo unknown arguments; users sometimes paste credentials here.
    throw new PublicBlogSnapshotCliUsageError('Unknown public blog snapshot option');
  }

  if (help && (sourcePath !== null
    || outputSeen
    || confirmEmptyBootstrap
    || confirmBootstrapContinuation)) {
    throw new PublicBlogSnapshotCliUsageError('Help cannot be combined with build options');
  }
  if (!help && sourcePath === null) {
    throw new PublicBlogSnapshotCliUsageError('--source is required');
  }
  if (confirmEmptyBootstrap && confirmBootstrapContinuation) {
    throw new PublicBlogSnapshotCliUsageError(
      'Empty bootstrap and bootstrap continuation cannot be combined',
    );
  }
  return {
    help,
    sourcePath,
    outputDir,
    confirmEmptyBootstrap,
    confirmBootstrapContinuation,
  };
}

export async function readTrustedPublicBlogSourceFile(sourcePath: string): Promise<unknown> {
  let handle;
  try {
    handle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    throw new Error('Trusted public blog source file could not be opened');
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_SOURCE_BYTES) {
      throw new Error('Trusted public blog source file size is invalid');
    }
    const chunks: Buffer[] = [];
    let byteLength = 0;
    while (byteLength <= MAX_SOURCE_BYTES) {
      const remaining = MAX_SOURCE_BYTES + 1 - byteLength;
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      byteLength += bytesRead;
    }
    if (byteLength < 1 || byteLength > MAX_SOURCE_BYTES) {
      throw new Error('Trusted public blog source file size is invalid');
    }
    const bytes = Buffer.concat(chunks, byteLength);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Trusted public blog source must be UTF-8 JSON');
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Trusted public blog source must be valid JSON');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Trusted public blog source')) {
      throw error;
    }
    throw new Error('Trusted public blog source file could not be read');
  } finally {
    await handle.close().catch(() => undefined);
  }
}

export async function runPublicBlogSnapshotCli(
  args: readonly string[],
  options: {
    cwd?: string;
    log?: (message: string) => void;
  } = {},
): Promise<number> {
  const parsed = parsePublicBlogSnapshotCliArguments(args);
  const log = options.log ?? console.log;
  if (parsed.help) {
    log(PUBLIC_BLOG_SNAPSHOT_CLI_HELP.trim());
    return 0;
  }
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const sourcePath = path.resolve(cwd, parsed.sourcePath!);
  const outputDir = path.resolve(cwd, parsed.outputDir);
  const source = await readTrustedPublicBlogSourceFile(sourcePath);
  const result = await publishPublicBlogSnapshotDryRun({
    source,
    outputDir,
    publicationMode: parsed.confirmEmptyBootstrap
      ? 'empty-bootstrap'
      : parsed.confirmBootstrapContinuation
        ? 'bootstrap-continuation'
        : 'standard',
  });
  log(
    `[public-blog-snapshot] local dry-run complete: release=${result.releaseId}`
      + ` posts=${result.payload.posts.length} categories=${result.payload.categories.length}`,
  );
  log(`[public-blog-snapshot] manifest: ${result.manifestUrl}`);
  return 0;
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runPublicBlogSnapshotCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown failure';
    console.error(`[public-blog-snapshot] failed: ${message}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (invokedDirectly) void main();
