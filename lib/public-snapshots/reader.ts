import type {
  PublicNamedArtifactEnvelope,
  PublicTransactionManifest,
  PublicTransactionSnapshot,
} from './contract';
import {
  PublicSnapshotValidationError,
  assertPublicTransactionManifest,
  assertPublicTransactionShardMatchesManifest,
} from './contract';
import {
  decodeAndValidatePublicNamedArtifact,
  decodeAndValidatePublicTransactionShard,
} from './artifact';
import { PUBLIC_TRANSACTION_MANIFEST_KEY } from './publisher';

export interface PublicSnapshotReaderOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Manifest and each artifact request get an independent bounded timeout. */
  timeoutMs?: number;
  /** Test hook; production defaults to AbortSignal.timeout(timeoutMs). */
  timeoutSignalFactory?: (timeoutMs: number) => AbortSignal;
}

type PublicSnapshotReadResource = 'manifest' | 'district snapshot' | 'named artifact';

const DEFAULT_REQUEST_TIMEOUT_MS = 4_000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;

export class PublicSnapshotReader {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly timeoutSignalFactory: (timeoutMs: number) => AbortSignal;

  constructor(options: PublicSnapshotReaderOptions) {
    this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    if (!['http:', 'https:'].includes(this.baseUrl.protocol)) {
      throw new Error('Public snapshot baseUrl must use HTTP or HTTPS');
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (!Number.isInteger(this.timeoutMs)
      || this.timeoutMs < 1
      || this.timeoutMs > MAX_REQUEST_TIMEOUT_MS) {
      throw new Error(`Public snapshot timeoutMs must be an integer between 1 and ${MAX_REQUEST_TIMEOUT_MS}`);
    }
    this.timeoutSignalFactory = options.timeoutSignalFactory ?? ((timeoutMs) => AbortSignal.timeout(timeoutMs));
  }

  private objectUrl(key: string): URL {
    if (key.startsWith('/') || key.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(key)) {
      throw new PublicSnapshotValidationError('reader', ['manifest contains an unsafe object key']);
    }
    return new URL(key, this.baseUrl);
  }

  private async withRequestTimeout<T>(
    resource: PublicSnapshotReadResource,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const signal = this.timeoutSignalFactory(this.timeoutMs);
    try {
      return await operation(signal);
    } catch (error) {
      if (signal.aborted) {
        // Fetch/stream errors can echo credentialed URLs. Never forward them.
        throw new Error(`Public snapshot ${resource} request timed out`);
      }
      throw error;
    }
  }

  async getManifest(): Promise<PublicTransactionManifest> {
    return this.withRequestTimeout('manifest', async (signal) => {
      const response = await this.fetchImpl(this.objectUrl(PUBLIC_TRANSACTION_MANIFEST_KEY), {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal,
      });
      if (!response.ok) throw new Error(`Public snapshot manifest request failed: HTTP ${response.status}`);
      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        throw new PublicSnapshotValidationError('manifest', ['response is not valid JSON']);
      }
      assertPublicTransactionManifest(parsed);
      return parsed;
    });
  }

  async getDistrictSnapshot(
    lawdCd: string,
    suppliedManifest?: PublicTransactionManifest,
  ): Promise<PublicTransactionSnapshot> {
    const manifest = suppliedManifest ?? await this.getManifest();
    assertPublicTransactionManifest(manifest);
    const entry = manifest.districts.find((candidate) => candidate.lawdCd === lawdCd);
    if (!entry) throw new Error(`District snapshot not found: ${lawdCd}`);
    const shardEntry = manifest.shards.find((candidate) => candidate.shardId === entry.shardId);
    if (!shardEntry) throw new PublicSnapshotValidationError('manifest', ['district shard is missing']);
    return this.withRequestTimeout('district snapshot', async (signal) => {
      const response = await this.fetchImpl(this.objectUrl(shardEntry.shard.key), {
        headers: { accept: 'application/json' },
        cache: 'force-cache',
        signal,
      });
      if (!response.ok) throw new Error(`District snapshot request failed: HTTP ${response.status}`);
      const shard = decodeAndValidatePublicTransactionShard(
        new Uint8Array(await response.arrayBuffer()),
        shardEntry.shard,
        shardEntry,
      );
      assertPublicTransactionShardMatchesManifest(shard, manifest);
      const matches = shard.snapshots.filter((snapshot) => snapshot.partition.lawdCd === lawdCd);
      if (matches.length !== 1) {
        throw new PublicSnapshotValidationError('shard', [
          `requested district must occur exactly once: ${lawdCd}`,
        ]);
      }
      return matches[0];
    });
  }

  async getNamedArtifact<T = unknown>(
    name: string,
    suppliedManifest?: PublicTransactionManifest,
  ): Promise<PublicNamedArtifactEnvelope<T>> {
    const manifest = suppliedManifest ?? await this.getManifest();
    assertPublicTransactionManifest(manifest);
    const entry = manifest.namedArtifacts.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`Named snapshot artifact not found: ${name}`);
    return this.withRequestTimeout('named artifact', async (signal) => {
      const response = await this.fetchImpl(this.objectUrl(entry.artifact.key), {
        headers: { accept: 'application/json' },
        cache: 'force-cache',
        signal,
      });
      if (!response.ok) throw new Error(`Named snapshot artifact request failed: HTTP ${response.status}`);
      return decodeAndValidatePublicNamedArtifact<T>(
        new Uint8Array(await response.arrayBuffer()),
        entry.artifact,
      );
    });
  }
}
