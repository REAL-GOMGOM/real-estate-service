import { EventEmitter } from 'node:events';
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { DISTRICT_CODE } from '../../district-codes';
import { assertMacLocalDatabaseUrl } from '../../local-postgres-url';
import type { PublicSnapshotObjectStore, PublicSnapshotPutInput } from '../object-store';
import {
  MACMINI_SYNC_HEALTH_SCHEMA,
  PublicSnapshotHealthGateError,
  assertMacMiniSyncHealthMarker,
  readAndAssertMacMiniSyncHealth,
  writeMacMiniSyncHealthMarker,
} from '../publish-health';
import {
  APARTMENT_INDEX_SELECT,
  DISTRICT_PRESALE_SELECT,
  DISTRICT_RENT_SELECT,
  DISTRICT_SALE_SELECT,
  HIGHLIGHTS_NEW_HIGHS_SELECT,
  HIGHLIGHTS_PER_CATEGORY,
  HIGHLIGHTS_PYEONG84_SELECT,
  HIGHLIGHTS_SURGES_SELECT,
  MARKET_LIVE_SELECT,
  PRESALE_SUMMARY_SELECT,
  PRODUCTION_COMPLETENESS_THRESHOLDS,
  PRODUCTION_RECENCY_THRESHOLDS,
  RENT_SUMMARY_SELECT,
  SALE_SUMMARY_SELECT,
  assertPublicTransactionReleaseCompleteness,
  collectPublicTransactionRelease,
  normalizePublicSourceDealDate,
  publishPublicTransactionsFromClient,
  publicSnapshotWindows,
  resolveSnapshotSourceAt,
  selectPublisherStore,
  type PublicSnapshotQueryClient,
} from '../../../scripts/publish-public-transactions';
import {
  createSignalAwareChildRunner,
  loadWrapperEnvironment,
  normalizedSyncExitCode,
  runSyncAndPublish,
} from '../../../scripts/run-local-sync-and-publish';
import { withPublicSnapshotPublicationLock } from '../publication-lock';
import {
  buildApartmentIndexArtifact,
  buildRolling30HighlightsArtifact,
  buildRolling30MarketLiveArtifact,
  buildRolling30SummaryArtifacts,
} from '../serving-artifacts';
import { MARKET_LIVE_REGIONS } from '../../market-live';
import {
  createPublicTransactionSnapshot,
  toPublicPresaleTransaction,
  toPublicRentTransaction,
  toPublicSaleTransaction,
} from '../source-mappers';

class MemoryStore implements PublicSnapshotObjectStore {
  readonly writes: PublicSnapshotPutInput[] = [];

  async putObject(input: PublicSnapshotPutInput) {
    this.writes.push(input);
    return {
      key: input.key,
      url: `memory://${input.key}`,
      etag: null,
      byteLength: input.body.byteLength,
    };
  }
}

class EmptyLedgerClient implements PublicSnapshotQueryClient {
  readonly calls: string[] = [];
  failOnRent = false;
  failOnSelect: string | null = null;

  async query<Row>(text: string): Promise<{ rows: Row[] }> {
    this.calls.push(text);
    if (this.failOnRent && text === DISTRICT_RENT_SELECT) throw new Error('planned rent query failure');
    if (text === this.failOnSelect) throw new Error('planned serving artifact query failure');
    if (text === MARKET_LIVE_SELECT) return { rows: emptyMarketLiveAggregates() as Row[] };
    return { rows: [] };
  }
}

function emptyMarketLiveAggregates() {
  return MARKET_LIVE_REGIONS.map((sigungu) => ({
    sigungu,
    recentSum: 0,
    recentCount: 0,
    previousSum: 0,
    previousCount: 0,
  }));
}

function completeDistrictSnapshots(includeOneRecord: boolean) {
  return Object.entries(DISTRICT_CODE).map(([district, lawdCd], index) =>
    createPublicTransactionSnapshot({
      lawdCd,
      district,
      period: { from: '2026-07-01', through: '2026-08-11' },
      generatedAt: '2026-08-11T03:00:00.000Z',
      records: includeOneRecord && index === 0 ? [
        toPublicSaleTransaction({
          dedupeKey: 'completeness-sale',
          masterId: null,
          aptName: '완전성테스트',
          sigungu: district,
          umdNm: '테스트동',
          areaM2: 84.9,
          floor: 10,
          dealAmount: 100_000,
          dealDate: '2026-08-10',
          buildYear: 2020,
          isCanceled: false,
        }),
        toPublicRentTransaction({
          dedupeKey: 'completeness-jeonse',
          aptName: '완전성테스트',
          sigungu: district,
          umdNm: '테스트동',
          areaM2: 84.9,
          floor: 10,
          dealDate: '2026-08-10',
          deposit: 50_000,
          monthlyRent: 0,
          buildYear: 2020,
          contractType: null,
          prevDeposit: null,
          prevMonthlyRent: null,
        }),
        toPublicRentTransaction({
          dedupeKey: 'completeness-monthly',
          aptName: '완전성테스트',
          sigungu: district,
          umdNm: '테스트동',
          areaM2: 59,
          floor: 9,
          dealDate: '2026-08-10',
          deposit: 10_000,
          monthlyRent: 100,
          buildYear: 2020,
          contractType: null,
          prevDeposit: null,
          prevMonthlyRent: null,
        }),
        toPublicPresaleTransaction({
          dedupeKey: 'completeness-presale',
          aptName: '완전성테스트',
          sigungu: district,
          umdNm: '테스트동',
          areaM2: 84.9,
          floor: 10,
          dealAmount: 120_000,
          dealDate: '2026-08-10',
          buildYear: 2026,
          isCanceled: false,
        }),
      ] : [],
    }));
}

function positiveNamedArtifacts() {
  const generatedAt = '2026-08-11T03:00:00.000Z';
  const saleAggregate = {
    sigungu: '강남구',
    cnt: 1,
    newHighs: 1,
    sum59: 100_000,
    cnt59: 1,
    sum84: 150_000,
    cnt84: 1,
  };
  const rentAggregate = {
    sigungu: '강남구',
    cnt: 1,
    sumDep59: 50_000,
    cnt59: 1,
    sumDep84: 80_000,
    cnt84: 1,
    sumRent59: 100,
    sumRent84: 200,
  };
  return [
    ...buildRolling30SummaryArtifacts({
      generatedAt,
      from: '2026-07-12',
      to: '2026-08-11',
      buy: [saleAggregate],
      jeonse: [rentAggregate],
      monthly: [rentAggregate],
      bunyang: [saleAggregate],
    }),
    buildRolling30HighlightsArtifact({
      generatedAt,
      newHighs: [{
        district: '강남구',
        dong: '역삼동',
        apt: '완전성 아파트',
        area: 84,
        floor: 10,
        price: 150_000,
        date: '2026-08-10',
        masterId: 'apt-1',
        prevHigh: 140_000,
      }],
      surges: [{
        district: '강남구',
        dong: '역삼동',
        apt: '완전성 아파트',
        area: 84,
        floor: 10,
        price: 150_000,
        date: '2026-08-10',
        masterId: 'apt-1',
        prevPrice: 100_000,
        ratePct: 50,
      }],
      pyeong84: [{
        district: '강남구',
        dong: '역삼동',
        apt: '완전성 아파트',
        area: 84,
        floor: 10,
        price: 150_000,
        date: '2026-08-10',
        masterId: 'apt-1',
      }],
    }),
    buildRolling30MarketLiveArtifact({
      generatedAt,
      aggregates: emptyMarketLiveAggregates(),
    }),
    buildApartmentIndexArtifact([{
      id: 'apt-1',
      name: '완전성 아파트',
      aliases: [],
      sido: '서울특별시',
      sigungu: '강남구',
      dong: '역삼동',
      lawdCd: '11680',
      totalHouseholds: 1000,
      score: null,
    }]),
  ];
}

describe('Mac mini sync health publication gate', () => {
  it('accepts recent exit 0 and Neon-only degraded exit 2', () => {
    const now = new Date('2026-08-11T06:00:00.000Z');
    for (const exitCode of [0, 2] as const) {
      const marker = {
        schema: MACMINI_SYNC_HEALTH_SCHEMA,
        completedAt: '2026-08-11T05:00:00.000Z',
        exitCode,
      };
      expect(() => assertMacMiniSyncHealthMarker(marker, { now })).not.toThrow();
    }
  });

  it('rejects exit 1 and stale markers', () => {
    const now = new Date('2026-08-11T06:00:00.000Z');
    expect(() => assertMacMiniSyncHealthMarker({
      schema: MACMINI_SYNC_HEALTH_SCHEMA,
      completedAt: '2026-08-11T05:00:00.000Z',
      exitCode: 1,
    }, { now })).toThrow('in progress or had a source/local failure');
    expect(() => assertMacMiniSyncHealthMarker({
      schema: MACMINI_SYNC_HEALTH_SCHEMA,
      completedAt: '2026-08-09T00:00:00.000Z',
      exitCode: 0,
    }, { now, maxAgeHours: 36 })).toThrow('older than 36 hours');
  });

  it('writes and reads the marker atomically, and missing markers fail closed', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-health-'));
    const markerPath = path.join(directory, 'health.json');
    const marker = {
      schema: MACMINI_SYNC_HEALTH_SCHEMA,
      completedAt: '2026-08-11T05:00:00.000Z',
      exitCode: 2 as const,
    };
    await writeMacMiniSyncHealthMarker(markerPath, marker);
    await expect(readAndAssertMacMiniSyncHealth({
      env: { NAEZIP_SYNC_HEALTH_MARKER: markerPath },
      now: new Date('2026-08-11T06:00:00.000Z'),
    })).resolves.toEqual(marker);
    await expect(readAndAssertMacMiniSyncHealth({
      env: { NAEZIP_SYNC_HEALTH_MARKER: path.join(directory, 'missing.json') },
    })).rejects.toBeInstanceOf(PublicSnapshotHealthGateError);
  });
});

describe('sync-and-publish wrapper', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'forwards %s to the active child and remembers cancellation',
    async (terminationSignal) => {
      const signalSource = new EventEmitter();
      const child = new EventEmitter() as EventEmitter & {
        kill(signal: NodeJS.Signals): boolean;
      };
      const killedWith: NodeJS.Signals[] = [];
      child.kill = (signal) => {
        killedWith.push(signal);
        return true;
      };
      const runner = createSignalAwareChildRunner({
        signalSource: signalSource as never,
        spawnImpl: (() => child) as never,
      });

      const result = runner.run('/test/tsx', ['scripts/macmini-sync.ts'], { NODE_ENV: 'test' });
      signalSource.emit(terminationSignal);
      expect(killedWith).toEqual([terminationSignal]);
      child.emit('exit', 0, null);
      await expect(result).resolves.toEqual({ code: null, signal: terminationSignal });
      await expect(runner.run('/test/tsx', ['never-spawn.ts'], { NODE_ENV: 'test' }))
        .resolves.toEqual({ code: null, signal: terminationSignal });

      runner.dispose();
      expect(signalSource.listenerCount('SIGINT')).toBe(0);
      expect(signalSource.listenerCount('SIGTERM')).toBe(0);
    },
  );

  it('records exit 1 and releases the publication lock after cancellation', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-wrapper-signal-'));
    const markerPath = path.join(directory, 'health.json');
    const lockPath = path.join(directory, 'publication.lock');
    let receivedSignal: NodeJS.Signals | null = null;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await withPublicSnapshotPublicationLock(
      { env: { NAEZIP_SNAPSHOT_LOCK_PATH: lockPath } },
      async () => runSyncAndPublish({
        markerPath,
        nodePath: '/test/node',
        terminationSignal: () => receivedSignal,
        runImpl: async () => {
          receivedSignal = 'SIGINT';
          return { code: null, signal: 'SIGINT' };
        },
      }),
    );

    expect(code).toBe(1);
    expect(JSON.parse(await readFile(markerPath, 'utf8'))).toMatchObject({ exitCode: 1 });
    await expect(access(lockPath)).rejects.toThrow();
  });

  it('loads .env.local or NAEZIP_ENV_FILE once while existing variables win', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-env-'));
    await writeFile(
      path.join(directory, '.env.local'),
      'NAEZIP_LOCAL_DB_URL=postgresql://file@localhost/file\nFROM_FILE=loaded\n',
      'utf8',
    );
    await chmod(path.join(directory, '.env.local'), 0o600);
    const loaded = await loadWrapperEnvironment({
      cwd: directory,
      baseEnv: {
        NODE_ENV: 'test',
        NAEZIP_LOCAL_DB_URL: 'postgresql://parent@localhost/parent',
      },
    });
    expect(loaded.FROM_FILE).toBe('loaded');
    expect(loaded.NAEZIP_LOCAL_DB_URL).toBe('postgresql://parent@localhost/parent');

    await writeFile(path.join(directory, 'publisher.env'), 'FROM_EXPLICIT=yes\n', 'utf8');
    await chmod(path.join(directory, 'publisher.env'), 0o600);
    const explicit = await loadWrapperEnvironment({
      cwd: directory,
      baseEnv: { NODE_ENV: 'test', NAEZIP_ENV_FILE: 'publisher.env' },
    });
    expect(explicit.FROM_EXPLICIT).toBe('yes');
  });

  it('checks regular-file and 0600 permissions before reading an environment file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-env-mode-'));
    const envPath = path.join(directory, '.env.local');
    await writeFile(envPath, 'SECRET_VALUE=never-logged\n', 'utf8');
    await chmod(envPath, 0o644);
    await expect(loadWrapperEnvironment({ cwd: directory, baseEnv: { NODE_ENV: 'test' } }))
      .rejects.toThrow('권한은 0600');
    await chmod(envPath, 0o660);
    await expect(loadWrapperEnvironment({ cwd: directory, baseEnv: { NODE_ENV: 'test' } }))
      .rejects.toThrow('권한은 0600');
    await chmod(envPath, 0o600);
    await expect(loadWrapperEnvironment({ cwd: directory, baseEnv: { NODE_ENV: 'test' } }))
      .resolves.toMatchObject({ SECRET_VALUE: 'never-logged' });

    const nonRegular = path.join(directory, 'env-directory');
    await mkdir(nonRegular);
    await expect(loadWrapperEnvironment({
      cwd: directory,
      baseEnv: { NODE_ENV: 'test', NAEZIP_ENV_FILE: nonRegular },
    })).rejects.toThrow('regular file');
  });

  it('records exit 2 and invokes publisher, but exit 1 blocks it', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-wrapper-'));
    const markerPath = path.join(directory, 'health.json');
    const childCommands: string[] = [];
    const commands: readonly string[][] = [];
    const called: string[][] = commands as string[][];
    const results = [
      { code: 0, signal: null },
      { code: 2, signal: null },
      { code: 0, signal: null },
    ];
    const sharedChildEnv = {
      NODE_ENV: 'test',
      FROM_FILE: 'same-for-both',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    } as NodeJS.ProcessEnv;
    const seenChildEnvs: NodeJS.ProcessEnv[] = [];
    const code = await runSyncAndPublish({
      markerPath,
      nodePath: '/test/node',
      now: () => new Date('2026-08-11T05:00:00.000Z'),
      publisherArgs: ['--dry-run'],
      childEnv: sharedChildEnv,
      runImpl: async (command, args, childEnv) => {
        childCommands.push(command);
        called.push([...args]);
        seenChildEnvs.push(childEnv);
        if (args[2] === 'scripts/macmini-sync.ts') {
          // The old healthy marker is invalidated before local sync can mutate a row.
          expect(JSON.parse(await readFile(markerPath, 'utf8'))).toMatchObject({ exitCode: 1 });
        }
        return results.shift()!;
      },
    });
    expect(code).toBe(0);
    expect(childCommands).toEqual(['/test/node', '/test/node', '/test/node']);
    expect(called).toEqual([
      ['--import', 'tsx', 'scripts/bootstrap-local-apt-scores.ts', '--check'],
      ['--import', 'tsx', 'scripts/macmini-sync.ts'],
      ['--import', 'tsx', 'scripts/publish-public-transactions.ts', '--dry-run'],
    ]);
    expect(seenChildEnvs[0]).toBe(sharedChildEnv);
    expect(seenChildEnvs[1]).toBe(sharedChildEnv);
    expect(seenChildEnvs[2]).toMatchObject({
      ...sharedChildEnv,
      NAEZIP_SNAPSHOT_SOURCE_AT: '2026-08-11T05:00:00.000Z',
    });
    expect(JSON.parse(await readFile(markerPath, 'utf8'))).toMatchObject({ exitCode: 2 });

    called.length = 0;
    const failed = await runSyncAndPublish({
      markerPath,
      nodePath: '/test/node',
      runImpl: async (_command, args) => {
        called.push([...args]);
        return args[2] === 'scripts/bootstrap-local-apt-scores.ts'
          ? { code: 0, signal: null }
          : { code: 1, signal: null };
      },
    });
    expect(failed).toBe(1);
    expect(called).toEqual([
      ['--import', 'tsx', 'scripts/bootstrap-local-apt-scores.ts', '--check'],
      ['--import', 'tsx', 'scripts/macmini-sync.ts'],
    ]);
    expect(JSON.parse(await readFile(markerPath, 'utf8'))).toMatchObject({ exitCode: 1 });
  });

  it('blocks publish when sync crosses a KST calendar-date boundary', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-wrapper-boundary-'));
    const markerPath = path.join(directory, 'health.json');
    const instants = [
      new Date('2026-08-31T14:59:00.000Z'), // KST 2026-08-31 23:59
      new Date('2026-08-31T15:01:00.000Z'), // KST 2026-09-01 00:01
    ];
    const commands: string[][] = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await runSyncAndPublish({
      markerPath,
      nodePath: '/test/node',
      now: () => instants.shift()!,
      childEnv: { NODE_ENV: 'test' },
      runImpl: async (_command, args) => {
        commands.push([...args]);
        return { code: 0, signal: null };
      },
    });

    expect(code).toBe(1);
    expect(commands).toEqual([
      ['--import', 'tsx', 'scripts/bootstrap-local-apt-scores.ts', '--check'],
      ['--import', 'tsx', 'scripts/macmini-sync.ts'],
    ]);
    expect(JSON.parse(await readFile(markerPath, 'utf8'))).toMatchObject({
      completedAt: '2026-08-31T15:01:00.000Z',
      exitCode: 1,
    });
  });

  it('normalizes signals and unexpected exit codes to a local/source failure', () => {
    expect(normalizedSyncExitCode({ code: 0, signal: 'SIGTERM' })).toBe(1);
    expect(normalizedSyncExitCode({ code: 9, signal: null })).toBe(1);
  });

  it('blocks sync before MOLIT fetch when the read-only local schema preflight fails', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'naezip-wrapper-preflight-'));
    const markerPath = path.join(directory, 'health.json');
    const commands: string[][] = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const code = await runSyncAndPublish({
      markerPath,
      nodePath: '/test/node',
      childEnv: { NODE_ENV: 'test' },
      runImpl: async (_command, args) => {
        commands.push([...args]);
        return { code: 1, signal: null };
      },
    });

    expect(code).toBe(1);
    expect(commands).toEqual([
      ['--import', 'tsx', 'scripts/bootstrap-local-apt-scores.ts', '--check'],
    ]);
    expect(JSON.parse(await readFile(markerPath, 'utf8'))).toMatchObject({ exitCode: 1 });
  });
});

describe('local PostgreSQL public transaction publisher', () => {
  it('fails closed unless production release has all 248 districts, records, and apartments', () => {
    const nonzeroSnapshots = completeDistrictSnapshots(true);
    const zeroSnapshots = completeDistrictSnapshots(false);
    const namedArtifacts = positiveNamedArtifacts();
    const indexArtifact = namedArtifacts.find((artifact) => artifact.name === 'apartment-index')!;

    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: nonzeroSnapshots.slice(0, 1),
      namedArtifacts,
    })).toThrow('district partition completeness failed');
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: nonzeroSnapshots,
      namedArtifacts: namedArtifacts.map((artifact) => artifact.name === 'apartment-index'
        ? { ...indexArtifact, itemCount: 0, data: [] }
        : artifact),
    })).toThrow('apartment-index is missing, mismatched, or zero rows');
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: zeroSnapshots,
      namedArtifacts,
    })).toThrow('all covered district snapshots are zero rows');
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: nonzeroSnapshots,
      namedArtifacts,
    })).toThrow('absolute floors failed');
    expect(PRODUCTION_COMPLETENESS_THRESHOLDS).toEqual({
      totalRecords: 10_000,
      nonemptyDistricts: 100,
      apartmentIndexItems: 25_000,
      saleRecords: 1_000,
      rentRecords: 1_000,
      presaleRecords: 10,
    });
    expect(PRODUCTION_RECENCY_THRESHOLDS).toEqual({
      saleMaxAgeDays: 14,
      rentMaxAgeDays: 14,
      presaleMaxAgeDays: 30,
    });
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: nonzeroSnapshots,
      namedArtifacts,
    }, {
      thresholdsForTest: {
        totalRecords: 1,
        nonemptyDistricts: 1,
        apartmentIndexItems: 1,
        saleRecords: 1,
        rentRecords: 0,
        presaleRecords: 0,
      },
    })).not.toThrow();
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: nonzeroSnapshots,
      namedArtifacts,
    }, {
      thresholdsForTest: {
        totalRecords: 1,
        nonemptyDistricts: 1,
        apartmentIndexItems: 1,
        saleRecords: 1,
        rentRecords: 1,
        presaleRecords: 1,
      },
      recencyThresholdsForTest: {
        saleMaxAgeDays: 0,
        rentMaxAgeDays: 0,
        presaleMaxAgeDays: 0,
      },
    })).toThrow('completeness recency failed');

    const mismatchedNamedArtifacts = namedArtifacts.map((artifact) => {
      if (artifact.name !== 'summary/rolling30/buy') return artifact;
      const data = structuredClone(artifact.data) as {
        summary: Array<{ estimatedCount: number; sampleCount: number }>;
      };
      data.summary[0].estimatedCount += 1;
      data.summary[0].sampleCount += 1;
      return { ...artifact, data };
    });
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: nonzeroSnapshots,
      namedArtifacts: mismatchedNamedArtifacts,
    }, {
      thresholdsForTest: {
        totalRecords: 1,
        nonemptyDistricts: 1,
        apartmentIndexItems: 1,
        saleRecords: 1,
        rentRecords: 1,
        presaleRecords: 1,
      },
    })).toThrow('summary/raw parity mismatch');
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: nonzeroSnapshots,
      namedArtifacts: namedArtifacts.filter((artifact) => artifact.name !== 'summary/rolling30/buy'),
    })).toThrow('expected exactly seven named artifacts');
    expect(() => assertPublicTransactionReleaseCompleteness({
      snapshots: [],
      namedArtifacts: [],
    }, { allowIncompleteForTest: true })).not.toThrow();
  });

  it('defaults production to explicit Blob mode and keeps Blob-configured dry-run local', () => {
    const env = {
      NODE_ENV: 'test',
      NAEZIP_SNAPSHOT_STORE: 'blob',
      BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_blog-store_blog-secret',
      NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_store-id_test-secret',
      NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL:
        'https://store-id.public.blob.vercel-storage.com/',
      NAEZIP_SNAPSHOT_DRY_RUN_DIR: path.join(os.tmpdir(), 'naezip-explicit-dry-run'),
    } as NodeJS.ProcessEnv;
    expect(selectPublisherStore(env, { forceDryRun: false }).mode).toBe('blob');
    expect(selectPublisherStore(env, { forceDryRun: true }).mode).toBe('local-dry-run');

    expect(() => selectPublisherStore({ NODE_ENV: 'test' }, { forceDryRun: false }))
      .toThrow('NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN');
    expect(() => selectPublisherStore({
      NODE_ENV: 'test',
      BLOB_READ_WRITE_TOKEN: 'generic-blog-token',
    }, { forceDryRun: false })).toThrow('NAEZIP_SNAPSHOT_BLOB_READ_WRITE_TOKEN');

    expect(selectPublisherStore({
      NODE_ENV: 'test',
      NAEZIP_SNAPSHOT_STORE: 'r2',
      NAEZIP_SNAPSHOT_R2_ACCOUNT_ID: 'account',
      NAEZIP_SNAPSHOT_R2_ACCESS_KEY_ID: 'access',
      NAEZIP_SNAPSHOT_R2_SECRET_ACCESS_KEY: 'secret',
      NAEZIP_SNAPSHOT_R2_BUCKET: 'bucket',
    }, { forceDryRun: false }).mode).toBe('r2');
  });

  it('publishes an authoritative zero-row district and all seven named artifacts', async () => {
    const client = new EmptyLedgerClient();
    const store = new MemoryStore();
    const result = await publishPublicTransactionsFromClient(client, store, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: Object.entries(DISTRICT_CODE),
      completeness: { allowIncompleteForTest: true },
    });
    expect(result.manifest.districts).toHaveLength(248);
    expect(result.manifest.districts.find(({ lawdCd }) => lawdCd === '11680')).toMatchObject({
      lawdCd: '11680',
      counts: { total: 0, sale: 0, rent: 0, presale: 0 },
      latestDealDate: null,
    });
    expect(result.manifest.shards).toHaveLength(24);
    expect(result.manifest.namedArtifacts).toHaveLength(7);
    expect(result.manifest.namedArtifacts.map(({ name }) => name).sort()).toEqual([
      'apartment-index',
      'highlights/rolling30',
      'market-live/rolling30',
      'summary/rolling30/bunyang',
      'summary/rolling30/buy',
      'summary/rolling30/jeonse',
      'summary/rolling30/monthly',
    ]);
    expect(result.uploads).toHaveLength(33);
    expect(new Set(result.manifest.districts.map(({ lawdCd }) => lawdCd)).size).toBe(248);
    expect(new Set(result.manifest.districts.map(({ shardId }) => shardId)).size).toBe(24);
    expect(store.writes.slice(0, 24).every(({ key }) => key.includes('/shards/'))).toBe(true);
    expect(store.writes.slice(24, 31).every(({ key }) => key.includes('/artifacts/'))).toBe(true);
    expect(store.writes.slice(31).every(({ key }) => key.endsWith('/manifest.json'))).toBe(true);
    expect(client.calls).toContain('COMMIT');
    expect(store.writes.at(-1)?.immutable).toBe(false);
  });

  it('never calls the object store when one allowlisted SELECT fails', async () => {
    const client = new EmptyLedgerClient();
    client.failOnRent = true;
    const store = new MemoryStore();
    await expect(publishPublicTransactionsFromClient(client, store, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: [['강남구', '11680']],
      completeness: { allowIncompleteForTest: true },
    })).rejects.toThrow('planned rent query failure');
    expect(client.calls).toContain('ROLLBACK');
    expect(client.calls).not.toContain('COMMIT');
    expect(store.writes).toHaveLength(0);
  });

  it.each([
    HIGHLIGHTS_NEW_HIGHS_SELECT,
    HIGHLIGHTS_SURGES_SELECT,
    HIGHLIGHTS_PYEONG84_SELECT,
    MARKET_LIVE_SELECT,
  ])('rolls back and stores zero objects when a new serving SELECT fails', async (failedSelect) => {
    const client = new EmptyLedgerClient();
    client.failOnSelect = failedSelect;
    const store = new MemoryStore();

    await expect(publishPublicTransactionsFromClient(client, store, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: [['강남구', '11680']],
      completeness: { allowIncompleteForTest: true },
    })).rejects.toThrow('planned serving artifact query failure');

    expect(client.calls).toContain('ROLLBACK');
    expect(client.calls).not.toContain('COMMIT');
    expect(store.writes).toHaveLength(0);
  });

  it('builds highlights and exact 60-day market-live data from the shared apartment index read', async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const client: PublicSnapshotQueryClient = {
      query: async <Row>(text: string, values?: readonly unknown[]) => {
        calls.push({ text, values });
        if (text === APARTMENT_INDEX_SELECT) {
          return { rows: [
            {
              id: 'apt-exact',
              name: '정식 단지명',
              aliases: ['원장 단지명'],
              sido: '서울특별시',
              sigungu: '강남구',
              dong: '역삼동',
              lawdCd: '11680',
              totalHouseholds: 1000,
              score: 91.5,
            },
            {
              id: 'apt-ambiguous-a',
              name: '모호한 정식명 A',
              aliases: ['모호 단지명'],
              sido: '서울특별시',
              sigungu: '강남구',
              dong: '삼성동',
              lawdCd: '11680',
              totalHouseholds: 500,
              score: null,
            },
            {
              id: 'apt-ambiguous-b',
              name: '모호한 정식명 B',
              aliases: ['모호 단지명'],
              sido: '서울특별시',
              sigungu: '강남구',
              dong: '삼성동',
              lawdCd: '11680',
              totalHouseholds: 600,
              score: null,
            },
          ] as Row[] };
        }
        if (text === HIGHLIGHTS_NEW_HIGHS_SELECT) {
          return { rows: [{
            sigungu: '강남구', umdNm: '역삼동', aptName: '원장 단지명', area: 85,
            floor: 0, price: 150_000, dealDate: '2026-08-10', prevHigh: 140_000,
          }] as Row[] };
        }
        if (text === HIGHLIGHTS_SURGES_SELECT) {
          return { rows: [{
            sigungu: '강남구', umdNm: '역삼동', aptName: '원장 단지명', area: 85,
            floor: 12, price: 130_000, dealDate: '2026-08-09', prevPrice: 100_000,
          }] as Row[] };
        }
        if (text === HIGHLIGHTS_PYEONG84_SELECT) {
          return { rows: [
            {
              sigungu: '강남구', umdNm: '역삼동', aptName: '원장 단지명', area: 85,
              floor: null, price: 160_000, dealDate: '2026-08-08',
            },
            {
              sigungu: '강남구', umdNm: '삼성동', aptName: '모호 단지명', area: 85,
              floor: 9, price: 120_000, dealDate: '2026-08-07',
            },
          ] as Row[] };
        }
        if (text === MARKET_LIVE_SELECT) {
          return { rows: emptyMarketLiveAggregates().map((row) => row.sigungu === '강남구'
            ? {
                ...row,
                recentSum: 300_000,
                recentCount: 2,
                previousSum: 100_000,
                previousCount: 1,
              }
            : row) as Row[] };
        }
        return { rows: [] as Row[] };
      },
    };

    const collected = await collectPublicTransactionRelease(client, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: [['강남구', '11680']],
    });
    const highlights = collected.namedArtifacts.find(
      ({ name }) => name === 'highlights/rolling30',
    )?.data as {
      newHighs: unknown[];
      surges: unknown[];
      pyeong84: unknown[];
    };
    const marketLive = collected.namedArtifacts.find(
      ({ name }) => name === 'market-live/rolling30',
    )?.data as {
      rows: Array<Record<string, unknown>>;
      windows: Record<string, unknown>;
    };

    expect(highlights.newHighs).toEqual([expect.objectContaining({
      apt: '원장 단지명', area: 85, masterId: 'apt-exact', floor: 1, prevHigh: 140_000,
    })]);
    expect(highlights.surges).toEqual([expect.objectContaining({
      area: 85, masterId: 'apt-exact', prevPrice: 100_000, ratePct: 30,
    })]);
    expect(highlights.pyeong84).toEqual([
      expect.objectContaining({ masterId: 'apt-exact', floor: 1, area: 85 }),
      expect.objectContaining({ apt: '모호 단지명', masterId: null, area: 85 }),
    ]);
    expect(marketLive.rows[0]).toEqual({
      region: '강남구',
      recentAverage: 150_000,
      recentCount: 2,
      previousAverage: 100_000,
      previousCount: 1,
      changePct: 50,
    });
    expect(marketLive.windows).toEqual({
      recent: { from: '2026-07-13', toExclusive: '2026-08-12', days: 30 },
      previous: { from: '2026-06-13', toExclusive: '2026-07-13', days: 30 },
    });
    expect(calls.filter(({ text }) => text === APARTMENT_INDEX_SELECT)).toHaveLength(1);
    for (const query of [
      HIGHLIGHTS_NEW_HIGHS_SELECT,
      HIGHLIGHTS_SURGES_SELECT,
      HIGHLIGHTS_PYEONG84_SELECT,
    ]) {
      expect(calls.find(({ text }) => text === query)?.values)
        .toEqual(['2026-07-13', '2026-08-12', HIGHLIGHTS_PER_CATEGORY]);
    }
    expect(calls.find(({ text }) => text === MARKET_LIVE_SELECT)?.values)
      .toEqual([MARKET_LIVE_REGIONS, '2026-06-13', '2026-07-13', '2026-08-12']);
  });

  it('publishes presale rows that have no master_id column as unmatched', async () => {
    const client: PublicSnapshotQueryClient = {
      query: async <Row>(text: string) => {
        if (text === MARKET_LIVE_SELECT) {
          return { rows: emptyMarketLiveAggregates() as Row[] };
        }
        if (text !== DISTRICT_PRESALE_SELECT) return { rows: [] as Row[] };
        return { rows: [{
          dedupeKey: 'presale-without-master-id',
          aptName: '분양권 테스트 단지',
          sigungu: '강남구',
          umdNm: '역삼동',
          areaM2: 84.9,
          floor: 10,
          dealAmount: 150_000,
          dealDate: '2026-08-10',
          buildYear: null,
          isCanceled: false,
        }] as Row[] };
      },
    };

    const collected = await collectPublicTransactionRelease(client, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: [['강남구', '11680']],
    });

    expect(collected.snapshots[0]?.records).toEqual([
      expect.objectContaining({
        kind: 'presale',
        apartmentId: null,
        aptName: '분양권 테스트 단지',
      }),
    ]);
  });

  it('still rejects sale rows whose selected master_id is missing', async () => {
    const calls: string[] = [];
    const client: PublicSnapshotQueryClient = {
      query: async <Row>(text: string) => {
        calls.push(text);
        if (text !== DISTRICT_SALE_SELECT) return { rows: [] as Row[] };
        return { rows: [{
          dedupeKey: 'sale-without-selected-master-id',
          aptName: '매매 테스트 단지',
          sigungu: '강남구',
          umdNm: '역삼동',
          areaM2: 84.9,
          floor: 10,
          dealAmount: 150_000,
          dealDate: '2026-08-10',
          buildYear: 2020,
          isCanceled: false,
        }] as Row[] };
      },
    };
    const store = new MemoryStore();

    await expect(publishPublicTransactionsFromClient(client, store, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: [['강남구', '11680']],
      completeness: { allowIncompleteForTest: true },
    })).rejects.toThrow('sale.masterId is invalid');

    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(store.writes).toHaveLength(0);
  });

  it('does not publish healthy raw/index data when all four summary SELECTs are empty', async () => {
    const districtByCode = new Map(Object.entries(DISTRICT_CODE).map(([district, code]) => [code, district]));
    const client: PublicSnapshotQueryClient = {
      query: async <Row>(text: string, values?: readonly unknown[]) => {
        const lawdCd = String(values?.[0] ?? '');
        const sigungu = districtByCode.get(lawdCd) ?? '강남구';
        if (text === DISTRICT_SALE_SELECT || text === DISTRICT_PRESALE_SELECT) {
          return { rows: [{
            dedupeKey: `${text === DISTRICT_SALE_SELECT ? 'sale' : 'presale'}-${lawdCd}`,
            masterId: null,
            aptName: '원장 정상 단지',
            sigungu,
            umdNm: '테스트동',
            areaM2: 84.9,
            floor: 10,
            dealAmount: 100_000,
            dealDate: '2026-08-10',
            buildYear: 2020,
            isCanceled: false,
          }] as Row[] };
        }
        if (text === DISTRICT_RENT_SELECT) {
          return { rows: [{
            dedupeKey: `rent-${lawdCd}`,
            aptName: '원장 정상 단지',
            sigungu,
            umdNm: '테스트동',
            areaM2: 84.9,
            floor: 10,
            dealDate: '2026-08-10',
            deposit: 50_000,
            monthlyRent: 0,
            buildYear: 2020,
            contractType: null,
            prevDeposit: null,
            prevMonthlyRent: null,
          }] as Row[] };
        }
        if (text === APARTMENT_INDEX_SELECT) {
          return { rows: [{
            id: 'apt-1',
            name: '원장 정상 단지',
            aliases: [],
            sido: '서울특별시',
            sigungu: '강남구',
            dong: '역삼동',
            lawdCd: '11680',
            totalHouseholds: 1000,
            score: null,
          }] as Row[] };
        }
        if (text === MARKET_LIVE_SELECT) {
          return { rows: emptyMarketLiveAggregates() as Row[] };
        }
        return { rows: [] as Row[] };
      },
    };
    const store = new MemoryStore();
    await expect(publishPublicTransactionsFromClient(client, store, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      completeness: {
        thresholdsForTest: {
          totalRecords: 1,
          nonemptyDistricts: 1,
          apartmentIndexItems: 1,
          saleRecords: 1,
          rentRecords: 1,
          presaleRecords: 1,
        },
      },
    })).rejects.toThrow('summary is zero rows');
    expect(store.writes).toHaveLength(0);
  });

  it('publishes null for an unmatched score but fails closed when apt_scores is unavailable', async () => {
    const nullableScoreClient: PublicSnapshotQueryClient = {
      query: async <Row>(text: string) => ({
        rows: (text === APARTMENT_INDEX_SELECT ? [{
          id: 'apt-1',
          name: '테스트 아파트',
          aliases: [],
          sido: '서울특별시',
          sigungu: '강남구',
          dong: '역삼동',
          lawdCd: '11680',
          totalHouseholds: 1000,
          score: null,
        }] : text === MARKET_LIVE_SELECT ? emptyMarketLiveAggregates() : []) as Row[],
      }),
    };
    const collected = await collectPublicTransactionRelease(nullableScoreClient, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: [['강남구', '11680']],
    });
    const index = collected.namedArtifacts.find((artifact) => artifact.name === 'apartment-index');
    expect(index?.data).toEqual([expect.objectContaining({ id: 'apt-1', score: null })]);

    const missingScoreTableClient: PublicSnapshotQueryClient = {
      query: async <Row>(text: string) => {
        if (text === APARTMENT_INDEX_SELECT) throw new Error('relation "apt_scores" does not exist');
        return { rows: [] as Row[] };
      },
    };
    const store = new MemoryStore();
    await expect(publishPublicTransactionsFromClient(missingScoreTableClient, store, {
      now: new Date('2026-08-11T03:00:00.000Z'),
      districts: [['강남구', '11680']],
      completeness: { allowIncompleteForTest: true },
    })).rejects.toThrow('apt_scores');
    expect(store.writes).toHaveLength(0);
  });

  it('uses exact summary, highlight, market-live, and apartment-index SQL semantics', () => {
    const normalizedSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();
    expect(SALE_SUMMARY_SELECT).toContain("right(deal_date, 2) <> '00'");
    expect(SALE_SUMMARY_SELECT).toContain('is_canceled = false');
    expect(SALE_SUMMARY_SELECT).toContain('history.deal_date < latest.deal_date');
    expect(SALE_SUMMARY_SELECT.match(/\b(?:FROM|JOIN) transactions\b/g)).toHaveLength(2);
    expect(PRESALE_SUMMARY_SELECT).toContain('FROM silv_transactions');
    expect(PRESALE_SUMMARY_SELECT.match(/\b(?:FROM|JOIN) silv_transactions\b/g)).toHaveLength(2);
    expect(PRESALE_SUMMARY_SELECT).not.toMatch(/\b(?:FROM|JOIN) transactions\b/);
    expect(RENT_SUMMARY_SELECT).toContain("right(deal_date, 2) <> '00'");
    expect(RENT_SUMMARY_SELECT).toContain('monthly_rent > 0');
    expect(APARTMENT_INDEX_SELECT).not.toContain('SELECT *');
    expect(APARTMENT_INDEX_SELECT).toContain('FROM public.apt_scores');

    expect(HIGHLIGHTS_NEW_HIGHS_SELECT).toContain("right(deal_date, 2) <> '00'");
    expect(HIGHLIGHTS_NEW_HIGHS_SELECT).toContain('t.deal_date < l.deal_date');
    expect(HIGHLIGHTS_NEW_HIGHS_SELECT).toContain('deal_amount > prev_high');
    expect(HIGHLIGHTS_NEW_HIGHS_SELECT)
      .toContain('deal_date DESC, deal_amount DESC, floor DESC');
    expect(HIGHLIGHTS_NEW_HIGHS_SELECT).toContain('floor DESC NULLS LAST');
    expect(HIGHLIGHTS_NEW_HIGHS_SELECT).toContain('area_r AS area');
    expect(HIGHLIGHTS_NEW_HIGHS_SELECT).not.toContain('area_m2::float8 AS area');
    expect(HIGHLIGHTS_NEW_HIGHS_SELECT.match(/\b(?:FROM|JOIN) transactions\b/g)).toHaveLength(2);
    expect(normalizedSql(HIGHLIGHTS_NEW_HIGHS_SELECT)).toContain(
      'ORDER BY deal_amount DESC, sigungu, umd_nm, apt_name, area_r, floor DESC NULLS LAST, deal_date DESC LIMIT $3',
    );
    expect(HIGHLIGHTS_SURGES_SELECT).toContain('row_number() OVER');
    expect(HIGHLIGHTS_SURGES_SELECT).toContain('r1.rn = 1 AND r2.rn = 2');
    expect(HIGHLIGHTS_SURGES_SELECT).toContain('r1.deal_amount > r2.deal_amount');
    expect(HIGHLIGHTS_SURGES_SELECT).toContain('deal_date DESC, deal_amount DESC, floor DESC');
    expect(normalizedSql(HIGHLIGHTS_SURGES_SELECT)).toContain(
      'ORDER BY (r1.deal_amount - r2.deal_amount)::float8 / r2.deal_amount DESC, r1.sigungu, r1.umd_nm, r1.apt_name, r1.area_r, r1.floor DESC NULLS LAST, r1.deal_date DESC LIMIT $3',
    );
    expect(HIGHLIGHTS_PYEONG84_SELECT)
      .toContain('round(area_m2::numeric)::int BETWEEN 80 AND 88');
    expect(HIGHLIGHTS_PYEONG84_SELECT)
      .toContain('DISTINCT ON (sigungu, umd_nm, apt_name)');
    expect(HIGHLIGHTS_PYEONG84_SELECT)
      .toContain('deal_amount DESC, deal_date DESC, floor DESC');
    expect(normalizedSql(HIGHLIGHTS_PYEONG84_SELECT)).toContain(
      'ORDER BY deal_amount DESC, sigungu, umd_nm, apt_name, area_r, floor DESC NULLS LAST, deal_date DESC LIMIT $3',
    );
    for (const query of [
      HIGHLIGHTS_NEW_HIGHS_SELECT,
      HIGHLIGHTS_SURGES_SELECT,
      HIGHLIGHTS_PYEONG84_SELECT,
    ]) {
      expect(query).toContain('is_canceled = false');
      expect(query).toContain('LIMIT $3');
    }

    expect(MARKET_LIVE_SELECT).toContain('SELECT unnest($1::text[]) AS sigungu');
    expect(MARKET_LIVE_SELECT).toContain('deal_date >= $2 AND deal_date < $4');
    expect(MARKET_LIVE_SELECT).toContain('w.deal_date >= $3');
    expect(MARKET_LIVE_SELECT).toContain('w.deal_date < $3');
    expect(MARKET_LIVE_SELECT).toContain('area_m2 BETWEEN 80 AND 88');
    expect(MARKET_LIVE_SELECT).not.toContain('round(area_m2');
    expect(MARKET_LIVE_SELECT).toContain('is_canceled = false');
    expect(MARKET_LIVE_SELECT).toContain('LEFT JOIN w USING (sigungu)');
  });

  it('preserves unknown MOLIT days as YYYY-MM and refuses remote databases', () => {
    expect(publicSnapshotWindows(new Date('2026-08-11T03:00:00.000Z'))).toMatchObject({
      fromMonth: '2026-07',
      throughMonth: '2026-08',
      period: { from: '2026-07-01', through: '2026-08-11' },
    });
    expect(normalizePublicSourceDealDate('2026-08-00')).toBe('2026-08');
    expect(normalizePublicSourceDealDate('2026-08-11')).toBe('2026-08-11');
    expect(() => normalizePublicSourceDealDate('2026-02-31')).toThrow('dealDate is invalid');
    expect(assertMacLocalDatabaseUrl('postgresql://user@localhost:5432/naezip'))
      .toBe('postgresql://user@localhost:5432/naezip');
    expect(() => assertMacLocalDatabaseUrl('postgresql://user@remote.example/naezip'))
      .toThrow('local Mac mini');
    expect(() => assertMacLocalDatabaseUrl('postgresql://user@localhost/naezip?host=remote.example'))
      .toThrow('routing override parameter');
    expect(() => assertMacLocalDatabaseUrl('postgresql://user@localhost/naezip?HOSTADDR=203.0.113.1'))
      .toThrow('routing override parameter');
    expect(() => assertMacLocalDatabaseUrl('postgresql://user@localhost/naezip?service=production'))
      .toThrow('routing override parameter');
    expect(() => assertMacLocalDatabaseUrl('postgresql:///naezip'))
      .toThrow('local Mac mini');
  });

  it('uses the validated sync completion as source time across a KST month boundary', () => {
    const marker = { completedAt: '2026-08-31T14:59:30.000Z' };
    const sourceAt = resolveSnapshotSourceAt({
      env: { NAEZIP_SNAPSHOT_SOURCE_AT: marker.completedAt },
      marker,
      now: new Date('2026-09-01T01:00:00.000Z'),
    });

    expect(sourceAt.toISOString()).toBe(marker.completedAt);
    expect(publicSnapshotWindows(sourceAt)).toMatchObject({
      fromMonth: '2026-07',
      throughMonth: '2026-08',
      period: { from: '2026-07-01', through: '2026-08-31' },
    });
    expect(() => resolveSnapshotSourceAt({
      env: { NAEZIP_SNAPSHOT_SOURCE_AT: '2026-09-01T01:00:00.000Z' },
      marker,
    })).toThrow('does not match');
    expect(() => resolveSnapshotSourceAt({
      env: {},
      requireExplicit: true,
    })).toThrow('is required when production publish bypasses');
  });
});
