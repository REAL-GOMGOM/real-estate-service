import type {
  PublicNamedArtifactEnvelope,
  PublicTransactionSnapshot,
} from './contract';
import { PublicSnapshotValidationError } from './contract';
import { PublicSnapshotReader } from './reader';

export const PUBLIC_SNAPSHOT_BASE_URL_ENV = 'NEXT_PUBLIC_TRANSACTION_SNAPSHOT_BASE_URL' as const;

export type PublicSnapshotRuntimeOperation = 'configuration' | 'district' | 'named-artifact';
export type PublicSnapshotUnavailableReason =
  | 'invalid-base-url'
  | 'invalid-request'
  | 'invalid-artifact'
  | 'network-error'
  | 'read-failed';

export type PublicSnapshotRuntimeResult<T> =
  | { status: 'success'; data: T }
  | { status: 'disabled'; reason: 'base-url-not-configured' }
  | { status: 'unavailable'; reason: PublicSnapshotUnavailableReason };

export interface PublicSnapshotRuntimeLogEvent {
  event: 'public-snapshot-unavailable';
  operation: PublicSnapshotRuntimeOperation;
  reason: PublicSnapshotUnavailableReason;
}

export interface PublicSnapshotRuntimeLogger {
  warn(event: PublicSnapshotRuntimeLogEvent): void;
}

export interface PublicSnapshotRuntimeOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  logger?: PublicSnapshotRuntimeLogger;
}

const defaultLogger: PublicSnapshotRuntimeLogger = {
  warn(event) {
    // The event is deliberately closed: never add error.message, URLs, headers,
    // or response bodies here. Fetch errors can contain credentialed URLs.
    console.warn('[public-snapshots/runtime]', event);
  },
};

function unavailableReason(error: unknown): PublicSnapshotUnavailableReason {
  if (error instanceof PublicSnapshotValidationError) return 'invalid-artifact';
  if (error instanceof TypeError) return 'network-error';
  return 'read-failed';
}

function safeBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)
      || url.username
      || url.password
      || url.search
      || url.hash) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Fail-open snapshot runtime for routes: callers always receive an explicit
 * status and can fall back to the existing data source without catching.
 */
export class PublicSnapshotRuntime {
  private readonly reader: PublicSnapshotReader | null;
  private readonly logger: PublicSnapshotRuntimeLogger;
  private readonly initialStatus: 'ready' | 'disabled' | 'invalid-base-url';

  constructor(options: PublicSnapshotRuntimeOptions) {
    this.logger = options.logger ?? defaultLogger;
    const configured = options.baseUrl?.trim();
    if (!configured) {
      this.initialStatus = 'disabled';
      this.reader = null;
      return;
    }
    const baseUrl = safeBaseUrl(configured);
    if (!baseUrl) {
      this.initialStatus = 'invalid-base-url';
      this.reader = null;
      return;
    }
    this.initialStatus = 'ready';
    this.reader = new PublicSnapshotReader({ baseUrl, fetchImpl: options.fetchImpl });
  }

  private warn(event: PublicSnapshotRuntimeLogEvent): void {
    // Observability must not turn a recoverable snapshot miss into a route error.
    try {
      this.logger.warn(event);
    } catch {
      // fail open
    }
  }

  private inactiveResult<T>(operation: PublicSnapshotRuntimeOperation): PublicSnapshotRuntimeResult<T> | null {
    if (this.initialStatus === 'disabled') {
      return { status: 'disabled', reason: 'base-url-not-configured' };
    }
    if (this.initialStatus === 'invalid-base-url') {
      const result = { status: 'unavailable', reason: 'invalid-base-url' } as const;
      this.warn({ event: 'public-snapshot-unavailable', operation, reason: result.reason });
      return result;
    }
    return null;
  }

  private invalidRequest<T>(operation: PublicSnapshotRuntimeOperation): PublicSnapshotRuntimeResult<T> {
    const result = { status: 'unavailable', reason: 'invalid-request' } as const;
    this.warn({ event: 'public-snapshot-unavailable', operation, reason: result.reason });
    return result;
  }

  private failedRead<T>(
    operation: PublicSnapshotRuntimeOperation,
    error: unknown,
  ): PublicSnapshotRuntimeResult<T> {
    const reason = unavailableReason(error);
    this.warn({ event: 'public-snapshot-unavailable', operation, reason });
    return { status: 'unavailable', reason };
  }

  async getDistrictSnapshot(
    lawdCd: string,
  ): Promise<PublicSnapshotRuntimeResult<PublicTransactionSnapshot>> {
    const inactive = this.inactiveResult<PublicTransactionSnapshot>('district');
    if (inactive) return inactive;
    if (!/^\d{5}$/.test(lawdCd)) return this.invalidRequest('district');
    try {
      return { status: 'success', data: await this.reader!.getDistrictSnapshot(lawdCd) };
    } catch (error) {
      return this.failedRead('district', error);
    }
  }

  async getNamedArtifact<T = unknown>(
    name: string,
  ): Promise<PublicSnapshotRuntimeResult<PublicNamedArtifactEnvelope<T>>> {
    const inactive = this.inactiveResult<PublicNamedArtifactEnvelope<T>>('named-artifact');
    if (inactive) return inactive;
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(name) || name.includes('..')) {
      return this.invalidRequest('named-artifact');
    }
    try {
      return { status: 'success', data: await this.reader!.getNamedArtifact<T>(name) };
    } catch (error) {
      return this.failedRead('named-artifact', error);
    }
  }
}

export function createPublicSnapshotRuntimeFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
  options: Omit<PublicSnapshotRuntimeOptions, 'baseUrl'> = {},
): PublicSnapshotRuntime {
  return new PublicSnapshotRuntime({
    ...options,
    baseUrl: env[PUBLIC_SNAPSHOT_BASE_URL_ENV],
  });
}
