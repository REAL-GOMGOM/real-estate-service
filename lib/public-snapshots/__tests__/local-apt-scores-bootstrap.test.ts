import { describe, expect, it } from 'vitest';

import {
  CREATE_LOCAL_APT_SCORES_INDEX_SQL,
  CREATE_LOCAL_APT_SCORES_TABLE_SQL,
  INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL,
  bootstrapLocalAptScoresTable,
  checkLocalSnapshotSchema,
  type assertLocalAptScoresSchema,
} from '../../../scripts/bootstrap-local-apt-scores';

type InspectionRows = Parameters<typeof assertLocalAptScoresSchema>[0];

const validColumns: InspectionRows = [
  { columnName: 'id', dataType: 'text', isNullable: 'NO' },
  { columnName: 'master_id', dataType: 'text', isNullable: 'YES' },
  { columnName: 'district', dataType: 'text', isNullable: 'NO' },
  { columnName: 'score', dataType: 'real', isNullable: 'NO' },
  { columnName: 'region_score', dataType: 'real', isNullable: 'NO' },
  { columnName: 'is_region_top', dataType: 'boolean', isNullable: 'NO' },
  { columnName: 'confidence', dataType: 'text', isNullable: 'NO' },
  { columnName: 'station_m', dataType: 'integer', isNullable: 'YES' },
  { columnName: 'elem_school', dataType: 'boolean', isNullable: 'YES' },
  { columnName: 'brand_score', dataType: 'integer', isNullable: 'YES' },
  { columnName: 'far', dataType: 'real', isNullable: 'YES' },
  { columnName: 'far_limit', dataType: 'real', isNullable: 'YES' },
  { columnName: 'parking_per_hh', dataType: 'real', isNullable: 'YES' },
  { columnName: 'build_year', dataType: 'integer', isNullable: 'YES' },
  { columnName: 'updated_at', dataType: 'timestamp with time zone', isNullable: 'NO' },
];

describe('local apt_scores schema bootstrap', () => {
  it('creates only apt_scores idempotently and commits after validating its schema', async () => {
    const calls: string[] = [];
    const client = {
      query: async <Row>(text: string) => {
        calls.push(text);
        return {
          rows: (text === INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL ? validColumns : []) as Row[],
        };
      },
    };

    await bootstrapLocalAptScoresTable(client);

    expect(calls).toEqual([
      'BEGIN',
      CREATE_LOCAL_APT_SCORES_TABLE_SQL,
      CREATE_LOCAL_APT_SCORES_INDEX_SQL,
      INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL,
      'COMMIT',
    ]);
    expect(CREATE_LOCAL_APT_SCORES_TABLE_SQL)
      .toContain('CREATE TABLE IF NOT EXISTS "public"."apt_scores"');
    expect(CREATE_LOCAL_APT_SCORES_INDEX_SQL).toContain('CREATE INDEX IF NOT EXISTS');
    expect(CREATE_LOCAL_APT_SCORES_INDEX_SQL).toContain('ON "public"."apt_scores"');
    expect(INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL).toContain("table_schema = 'public'");
    expect(`${CREATE_LOCAL_APT_SCORES_TABLE_SQL}\n${CREATE_LOCAL_APT_SCORES_INDEX_SQL}`)
      .not.toMatch(/\b(?:transactions|rent_transactions|silv_transactions|apartments)\b/);
  });

  it('rolls back instead of repairing an incompatible existing apt_scores schema', async () => {
    const calls: string[] = [];
    const driftedColumns = validColumns.filter((column) => column.columnName !== 'score');
    const client = {
      query: async <Row>(text: string) => {
        calls.push(text);
        return {
          rows: (text === INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL ? driftedColumns : []) as Row[],
        };
      },
    };

    await expect(bootstrapLocalAptScoresTable(client))
      .rejects.toThrow('apt_scores schema is missing required column: score');
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
  });

  it('offers a read-only check and explains how to bootstrap a missing table', async () => {
    const calls: string[] = [];
    const client = {
      query: async <Row>(text: string) => {
        calls.push(text);
        return { rows: [] as Row[] };
      },
    };

    await expect(checkLocalSnapshotSchema(client))
      .rejects.toThrow('bootstrap-local-apt-scores.ts --execute');
    expect(calls).toEqual([INSPECT_LOCAL_APT_SCORES_COLUMNS_SQL]);
    expect(calls.join('\n')).not.toMatch(/\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\b/);
  });
});
