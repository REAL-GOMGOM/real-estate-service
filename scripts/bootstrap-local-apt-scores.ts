import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Pool } from 'pg';

import { assertMacLocalDatabaseUrl } from '../lib/local-postgres-url';

const HELP = `
Usage: node --import tsx scripts/bootstrap-local-apt-scores.ts [--check | --execute]

Prepares only the apt_scores schema required by the local public-snapshot
publisher. The command is a dry run unless --execute is supplied, and it
accepts only NAEZIP_LOCAL_DB_URL pinned to localhost.

--check     Read-only schema validation used by the sync-and-publish preflight.
--execute   Create the missing table/index, then validate the resulting schema.
`;

export const CREATE_LOCAL_APT_SCORES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS "public"."apt_scores" (
    "id" text PRIMARY KEY NOT NULL,
    "master_id" text,
    "district" text NOT NULL,
    "score" real NOT NULL,
    "region_score" real NOT NULL,
    "is_region_top" boolean DEFAULT false NOT NULL,
    "confidence" text NOT NULL,
    "station_m" integer,
    "elem_school" boolean,
    "brand_score" integer,
    "far" real,
    "far_limit" real,
    "parking_per_hh" real,
    "build_year" integer,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )
`;

export const CREATE_LOCAL_APT_SCORES_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS "apt_scores_master_id_idx"
  ON "public"."apt_scores" ("master_id")
`;

export const INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL = `
  SELECT column_name AS "columnName",
         data_type AS "dataType",
         is_nullable AS "isNullable"
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'apt_scores'
   ORDER BY ordinal_position
`;

interface AptScoresBootstrapQueryClient {
  query<Row = Record<string, unknown>>(text: string): Promise<{ rows: Row[] }>;
}

interface ColumnInspectionRow {
  columnName: unknown;
  dataType: unknown;
  isNullable: unknown;
}

const REQUIRED_COLUMNS = [
  ['id', 'text', false],
  ['master_id', 'text', true],
  ['district', 'text', false],
  ['score', 'real', false],
  ['region_score', 'real', false],
  ['is_region_top', 'boolean', false],
  ['confidence', 'text', false],
  ['station_m', 'integer', true],
  ['elem_school', 'boolean', true],
  ['brand_score', 'integer', true],
  ['far', 'real', true],
  ['far_limit', 'real', true],
  ['parking_per_hh', 'real', true],
  ['build_year', 'integer', true],
  ['updated_at', 'timestamp with time zone', false],
] as const;

export function assertLocalAptScoresSchema(rows: readonly ColumnInspectionRow[]): void {
  if (rows.length === 0) {
    throw new Error(
      'public.apt_scores is missing; run scripts/bootstrap-local-apt-scores.ts --execute',
    );
  }
  const columns = new Map(rows.map((row) => [row.columnName, row]));
  for (const [name, dataType, nullable] of REQUIRED_COLUMNS) {
    const column = columns.get(name);
    if (!column) throw new Error(`apt_scores schema is missing required column: ${name}`);
    if (column.dataType !== dataType) {
      throw new Error(`apt_scores.${name} must have type ${dataType}`);
    }
    const expectedNullable = nullable ? 'YES' : 'NO';
    if (column.isNullable !== expectedNullable) {
      throw new Error(`apt_scores.${name} nullable contract must be ${expectedNullable}`);
    }
  }
}

export async function checkLocalSnapshotSchema(
  client: AptScoresBootstrapQueryClient,
): Promise<void> {
  const inspection = await client.query<ColumnInspectionRow>(INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL);
  assertLocalAptScoresSchema(inspection.rows);
}

export async function bootstrapLocalAptScoresTable(
  client: AptScoresBootstrapQueryClient,
): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(CREATE_LOCAL_APT_SCORES_TABLE_SQL);
    await client.query(CREATE_LOCAL_APT_SCORES_INDEX_SQL);
    await checkLocalSnapshotSchema(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP.trim());
    return 0;
  }
  const allowed = new Set(['--check', '--execute']);
  const unknown = args.filter((arg) => !allowed.has(arg));
  if (unknown.length > 0) throw new Error(`unknown option: ${unknown.join(', ')}`);
  if (args.includes('--check') && args.includes('--execute')) {
    throw new Error('--check and --execute are mutually exclusive');
  }

  const localDatabaseUrl = assertMacLocalDatabaseUrl(process.env.NAEZIP_LOCAL_DB_URL);
  if (!args.includes('--check') && !args.includes('--execute')) {
    console.log('[local-apt-scores] dry-run: apt_scores table/index would be created if absent');
    console.log('[local-apt-scores] apply with --execute');
    return 0;
  }

  const pool = new Pool({
    connectionString: localDatabaseUrl,
    application_name: 'naezip-local-apt-scores-bootstrap',
    max: 1,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  try {
    const client = await pool.connect();
    try {
      if (args.includes('--execute')) await bootstrapLocalAptScoresTable(client);
      else await checkLocalSnapshotSchema(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
  console.log(args.includes('--execute')
    ? '[local-apt-scores] public.apt_scores table/index ready; existing rows were preserved'
    : '[local-apt-scores] public.apt_scores schema check passed');
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  void main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.error('[local-apt-scores] failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
