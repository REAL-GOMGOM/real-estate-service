import type {
  PublicNamedArtifactEnvelope,
  PublicSnapshotCounts,
  PublicTransactionManifest,
  PublicTransactionSnapshot,
} from './contract';
import {
  PublicSnapshotValidationError,
  assertPublicTransactionManifest,
  countPublicTransactions,
} from './contract';
import {
  decodeAndValidatePublicNamedArtifact,
  decodeAndValidatePublicSnapshot,
} from './artifact';
import { PUBLIC_TRANSACTION_MANIFEST_KEY } from './publisher';

export interface PublicSnapshotReaderOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

function countsEqual(left: PublicSnapshotCounts, right: PublicSnapshotCounts): boolean {
  return left.total === right.total
    && left.sale === right.sale
    && left.rent === right.rent
    && left.presale === right.presale;
}

export class PublicSnapshotReader {
  private readonly baseUrl: URL;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PublicSnapshotReaderOptions) {
    this.baseUrl = new URL(options.baseUrl.endsWith('/') ? options.baseUrl : `${options.baseUrl}/`);
    if (!['http:', 'https:'].includes(this.baseUrl.protocol)) {
      throw new Error('Public snapshot baseUrl must use HTTP or HTTPS');
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private objectUrl(key: string): URL {
    if (key.startsWith('/') || key.includes('..') || !/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(key)) {
      throw new PublicSnapshotValidationError('reader', ['manifest contains an unsafe object key']);
    }
    return new URL(key, this.baseUrl);
  }

  async getManifest(): Promise<PublicTransactionManifest> {
    const response = await this.fetchImpl(this.objectUrl(PUBLIC_TRANSACTION_MANIFEST_KEY), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
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
  }

  async getDistrictSnapshot(
    lawdCd: string,
    suppliedManifest?: PublicTransactionManifest,
  ): Promise<PublicTransactionSnapshot> {
    const manifest = suppliedManifest ?? await this.getManifest();
    assertPublicTransactionManifest(manifest);
    const entry = manifest.districts.find((candidate) => candidate.lawdCd === lawdCd);
    if (!entry) throw new Error(`District snapshot not found: ${lawdCd}`);
    const response = await this.fetchImpl(this.objectUrl(entry.snapshot.key), {
      headers: { accept: 'application/json' },
      cache: 'force-cache',
    });
    if (!response.ok) throw new Error(`District snapshot request failed: HTTP ${response.status}`);
    const snapshot = decodeAndValidatePublicSnapshot(
      new Uint8Array(await response.arrayBuffer()),
      entry.snapshot,
      entry.counts.total,
    );
    if (snapshot.partition.lawdCd !== entry.lawdCd
      || snapshot.partition.district !== entry.district
      || snapshot.period.from !== entry.period.from
      || snapshot.period.through !== entry.period.through) {
      throw new PublicSnapshotValidationError('snapshot', ['partition metadata does not match manifest']);
    }
    if (!countsEqual(countPublicTransactions(snapshot.records), entry.counts)) {
      throw new PublicSnapshotValidationError('snapshot', ['kind counts do not match manifest']);
    }
    return snapshot;
  }

  async getNamedArtifact<T = unknown>(
    name: string,
    suppliedManifest?: PublicTransactionManifest,
  ): Promise<PublicNamedArtifactEnvelope<T>> {
    const manifest = suppliedManifest ?? await this.getManifest();
    assertPublicTransactionManifest(manifest);
    const entry = manifest.namedArtifacts.find((candidate) => candidate.name === name);
    if (!entry) throw new Error(`Named snapshot artifact not found: ${name}`);
    const response = await this.fetchImpl(this.objectUrl(entry.artifact.key), {
      headers: { accept: 'application/json' },
      cache: 'force-cache',
    });
    if (!response.ok) throw new Error(`Named snapshot artifact request failed: HTTP ${response.status}`);
    return decodeAndValidatePublicNamedArtifact<T>(
      new Uint8Array(await response.arrayBuffer()),
      entry.artifact,
    );
  }
}
