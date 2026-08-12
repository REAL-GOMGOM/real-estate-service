import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

import type {
  PublicNamedArtifactDescriptor,
  PublicNamedArtifactEnvelope,
  PublicSnapshotShardDescriptor,
  PublicTransactionShard,
} from './contract';
import {
  PUBLIC_TRANSACTION_SHARD_SCHEMA,
  PublicSnapshotValidationError,
  assertPublicTransactionShard,
} from './contract';

export interface EncodedPublicJsonArtifact<T = unknown> {
  body: Buffer;
  payload: Buffer;
  sha256: string;
  payloadSha256: string;
  byteLength: number;
  payloadByteLength: number;
  value: T;
}

export interface EncodedPublicTransactionShard extends EncodedPublicJsonArtifact<PublicTransactionShard> {
  shard: PublicTransactionShard;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

export function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function encodePublicJsonArtifact<T>(value: T): EncodedPublicJsonArtifact<T> {
  const payload = Buffer.from(stableJson(value), 'utf8');
  const body = gzipSync(payload, { level: 9 });
  return {
    body,
    payload,
    sha256: sha256Hex(body),
    payloadSha256: sha256Hex(payload),
    byteLength: body.byteLength,
    payloadByteLength: payload.byteLength,
    value,
  };
}

export function encodePublicTransactionShard(
  shard: PublicTransactionShard,
): EncodedPublicTransactionShard {
  assertPublicTransactionShard(shard);
  const encoded = encodePublicJsonArtifact(shard);
  return { ...encoded, shard };
}

function isGzip(body: Uint8Array): boolean {
  return body.byteLength >= 2 && body[0] === 0x1f && body[1] === 0x8b;
}

function decodeVerifiedPayload(
  receivedBody: Uint8Array,
  descriptor: Pick<
    PublicSnapshotShardDescriptor,
    'byteLength' | 'payloadByteLength' | 'payloadSha256' | 'sha256'
  >,
): Buffer {
  const received = Buffer.from(receivedBody);
  let payload: Buffer;
  if (isGzip(received)) {
    if (received.byteLength !== descriptor.byteLength) {
      throw new PublicSnapshotValidationError('artifact', ['compressed byte length does not match manifest']);
    }
    if (sha256Hex(received) !== descriptor.sha256) {
      throw new PublicSnapshotValidationError('artifact', ['compressed SHA-256 does not match manifest']);
    }
    try {
      payload = gunzipSync(received);
    } catch {
      throw new PublicSnapshotValidationError('artifact', ['gzip payload is invalid']);
    }
  } else {
    payload = received;
  }
  if (payload.byteLength !== descriptor.payloadByteLength) {
    throw new PublicSnapshotValidationError('artifact', ['payload byte length does not match manifest']);
  }
  if (sha256Hex(payload) !== descriptor.payloadSha256) {
    throw new PublicSnapshotValidationError('artifact', ['payload SHA-256 does not match manifest']);
  }
  return payload;
}

export function decodeAndValidatePublicTransactionShard(
  receivedBody: Uint8Array,
  descriptor: PublicSnapshotShardDescriptor,
  expected: { shardId: string; districtCount: number; recordCount: number },
): PublicTransactionShard {
  const payload = decodeVerifiedPayload(receivedBody, descriptor);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new PublicSnapshotValidationError('shard', ['payload is not valid JSON']);
  }
  assertPublicTransactionShard(parsed);
  if (parsed.schema !== PUBLIC_TRANSACTION_SHARD_SCHEMA
    || descriptor.schema !== PUBLIC_TRANSACTION_SHARD_SCHEMA) {
    throw new PublicSnapshotValidationError('shard', ['schema does not match manifest']);
  }
  if (parsed.shardId !== expected.shardId) {
    throw new PublicSnapshotValidationError('shard', ['shardId does not match manifest']);
  }
  if (parsed.snapshotCount !== expected.districtCount
    || parsed.snapshots.length !== expected.districtCount) {
    throw new PublicSnapshotValidationError('shard', ['district count does not match manifest']);
  }
  if (parsed.recordCount !== expected.recordCount) {
    throw new PublicSnapshotValidationError('shard', ['record count does not match manifest']);
  }
  return parsed;
}

export function decodeAndValidatePublicNamedArtifact<T = unknown>(
  receivedBody: Uint8Array,
  descriptor: PublicNamedArtifactDescriptor,
): PublicNamedArtifactEnvelope<T> {
  const payload = decodeVerifiedPayload(receivedBody, descriptor);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString('utf8'));
  } catch {
    throw new PublicSnapshotValidationError('named artifact', ['payload is not valid JSON']);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PublicSnapshotValidationError('named artifact', ['payload must be an object']);
  }
  const envelope = parsed as Partial<PublicNamedArtifactEnvelope<T>>;
  const keys = Object.keys(envelope).sort().join(',');
  if (keys !== 'data,generatedAt,itemCount,schema') {
    throw new PublicSnapshotValidationError('named artifact', ['payload envelope fields are invalid']);
  }
  if (envelope.schema !== descriptor.schema) {
    throw new PublicSnapshotValidationError('named artifact', ['schema does not match manifest']);
  }
  if (envelope.itemCount !== descriptor.itemCount) {
    throw new PublicSnapshotValidationError('named artifact', ['item count does not match manifest']);
  }
  if (typeof envelope.generatedAt !== 'string' || !Number.isFinite(Date.parse(envelope.generatedAt))) {
    throw new PublicSnapshotValidationError('named artifact', ['generatedAt is invalid']);
  }
  return envelope as PublicNamedArtifactEnvelope<T>;
}
