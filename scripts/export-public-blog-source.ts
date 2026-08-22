import { config } from 'dotenv';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

import {
  PublicBlogSourceExportError,
  exportPublicBlogSource,
  type PublicBlogSourceQueryClient,
} from '../lib/blog-snapshots/source-exporter';

export const PUBLIC_BLOG_SOURCE_EXPORT_CLI_HELP = `
Usage: npm run blog:source:export -- --output <absolute-file.json>
  [--confirm-bootstrap-continuation --lineage-started-at <UTC-ISO>]

Reads published blog rows with one read-only SELECT, validates the complete
naezip.public-blog.source.v1 export, and atomically installs a private 0600
JSON file. The parent directory must already exist.

The default policy still requires at least 43 posts. Bootstrap continuation is
an explicit temporary policy for 1..43 posts and never accepts an empty export.

--output <file>                  Required absolute destination file path.
--confirm-bootstrap-continuation
                                 Explicitly validate a 1..43 post bootstrap export.
--lineage-started-at <UTC-ISO>   Inclusive creation cutoff for that new lineage.
--help, -h                       Show this help.
`;

export class PublicBlogSourceExportCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBlogSourceExportCliUsageError';
  }
}

export interface PublicBlogSourceExportCliArguments {
  help: boolean;
  outputPath: string | null;
  confirmBootstrapContinuation: boolean;
  lineageStartedAt: string | null;
}

function takeOutputValue(
  args: readonly string[],
  index: number,
): { value: string; nextIndex: number } {
  const argument = args[index];
  if (argument.startsWith('--output=')) {
    const value = argument.slice('--output='.length);
    if (!value) throw new PublicBlogSourceExportCliUsageError('--output requires a value');
    return { value, nextIndex: index };
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new PublicBlogSourceExportCliUsageError('--output requires a value');
  }
  return { value, nextIndex: index + 1 };
}

function takeLineageStartedAtValue(
  args: readonly string[],
  index: number,
): { value: string; nextIndex: number } {
  const argument = args[index];
  if (argument.startsWith('--lineage-started-at=')) {
    const value = argument.slice('--lineage-started-at='.length);
    if (!value) {
      throw new PublicBlogSourceExportCliUsageError('--lineage-started-at requires a value');
    }
    return { value, nextIndex: index };
  }
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new PublicBlogSourceExportCliUsageError('--lineage-started-at requires a value');
  }
  return { value, nextIndex: index + 1 };
}

export function parsePublicBlogSourceExportCliArguments(
  args: readonly string[],
): PublicBlogSourceExportCliArguments {
  let help = false;
  let outputPath: string | null = null;
  let confirmBootstrapContinuation = false;
  let lineageStartedAt: string | null = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') {
      if (help) throw new PublicBlogSourceExportCliUsageError('Duplicate help option');
      help = true;
      continue;
    }
    if (argument === '--output' || argument.startsWith('--output=')) {
      if (outputPath !== null) {
        throw new PublicBlogSourceExportCliUsageError('Duplicate output option');
      }
      const parsed = takeOutputValue(args, index);
      outputPath = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    if (argument === '--confirm-bootstrap-continuation') {
      if (confirmBootstrapContinuation) {
        throw new PublicBlogSourceExportCliUsageError(
          'Duplicate bootstrap continuation confirmation',
        );
      }
      confirmBootstrapContinuation = true;
      continue;
    }
    if (argument === '--lineage-started-at'
      || argument.startsWith('--lineage-started-at=')) {
      if (lineageStartedAt !== null) {
        throw new PublicBlogSourceExportCliUsageError('Duplicate lineage start option');
      }
      const parsed = takeLineageStartedAtValue(args, index);
      lineageStartedAt = parsed.value;
      index = parsed.nextIndex;
      continue;
    }
    // Never repeat an unknown argument: it may contain a pasted credential.
    throw new PublicBlogSourceExportCliUsageError('Unknown public blog source export option');
  }
  if (help && (outputPath !== null
    || confirmBootstrapContinuation
    || lineageStartedAt !== null)) {
    throw new PublicBlogSourceExportCliUsageError('Help cannot be combined with export options');
  }
  if (!help && outputPath === null) {
    throw new PublicBlogSourceExportCliUsageError('--output is required');
  }
  if (outputPath !== null && !path.isAbsolute(outputPath)) {
    throw new PublicBlogSourceExportCliUsageError('--output must be an absolute file path');
  }
  if (confirmBootstrapContinuation && lineageStartedAt === null) {
    throw new PublicBlogSourceExportCliUsageError('--lineage-started-at is required');
  }
  if (!confirmBootstrapContinuation && lineageStartedAt !== null) {
    throw new PublicBlogSourceExportCliUsageError(
      '--lineage-started-at requires --confirm-bootstrap-continuation',
    );
  }
  if (lineageStartedAt !== null) {
    const timestamp = Date.parse(lineageStartedAt);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(lineageStartedAt)
      || !Number.isFinite(timestamp)
      || new Date(timestamp).toISOString() !== lineageStartedAt) {
      throw new PublicBlogSourceExportCliUsageError('--lineage-started-at is invalid');
    }
  }
  return { help, outputPath, confirmBootstrapContinuation, lineageStartedAt };
}

function createNeonQueryClient(databaseUrl: string | undefined): PublicBlogSourceQueryClient {
  if (!databaseUrl?.trim()) {
    throw new PublicBlogSourceExportError('Public blog source database is not configured');
  }
  try {
    const sql = neon(databaseUrl);
    return {
      query: async (queryText, params = []) => (
        await sql.query(queryText, [...params]) as unknown[]
      ),
    };
  } catch {
    // A malformed URL must never be reflected back to the terminal.
    throw new PublicBlogSourceExportError('Public blog source query client initialization failed');
  }
}

export async function runPublicBlogSourceExportCli(
  args: readonly string[],
  options: {
    env?: Readonly<Record<string, string | undefined>>;
    queryClient?: PublicBlogSourceQueryClient;
    now?: Date;
    log?: (message: string) => void;
  } = {},
): Promise<number> {
  const parsed = parsePublicBlogSourceExportCliArguments(args);
  const log = options.log ?? console.log;
  if (parsed.help) {
    log(PUBLIC_BLOG_SOURCE_EXPORT_CLI_HELP.trim());
    return 0;
  }
  const env = options.env ?? process.env;
  const queryClient = options.queryClient ?? createNeonQueryClient(env.DATABASE_URL);
  const result = await exportPublicBlogSource({
    queryClient,
    outputPath: parsed.outputPath!,
    now: options.now,
    publicationMode: parsed.confirmBootstrapContinuation
      ? 'bootstrap-continuation'
      : 'standard',
    lineageStartedAt: parsed.lineageStartedAt ?? undefined,
  });
  log(
    `[public-blog-source] complete: release=${result.releaseId}`
      + ` posts=${result.postCount} categories=${result.categoryCount}`,
  );
  return 0;
}

async function main(): Promise<void> {
  try {
    const envFile = process.env.NAEZIP_ENV_FILE ?? path.resolve(process.cwd(), '.env.local');
    config({ path: envFile });
    process.exitCode = await runPublicBlogSourceExportCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown failure';
    console.error(`[public-blog-source] failed: ${message}`);
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;
if (invokedDirectly) void main();
