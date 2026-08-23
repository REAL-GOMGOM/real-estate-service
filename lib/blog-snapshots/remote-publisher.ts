import { timingSafeEqual } from 'node:crypto';

import { sha256Hex, stableJson } from '@/lib/public-snapshots/artifact';

import {
  PUBLIC_BLOG_MANIFEST_KEY,
  PublicBlogSnapshotValidationError,
  assertPublicBlogPayloadMatchesManifest,
  assertPublicBlogSnapshotManifest,
  assertPublicBlogSnapshotPayload,
} from './contract';
import {
  buildPublicBlogSnapshotRelease,
  type PublicBlogPublicationMode,
} from './publisher';
import { PublicBlogSnapshotReader } from './reader';
import type {
  PublicBlogBlobManagementReadResult,
  PublicBlogRemoteObjectStore,
} from './blob-store';

export interface PublishPublicBlogSnapshotToBlobInput {
  source: unknown;
  expectedReleaseId: string;
  store: PublicBlogRemoteObjectStore;
  publicFetchImpl?: typeof fetch;
  now?: Date;
  publicationMode?: PublicBlogPublicationMode;
  expectedCurrentReleaseId?: string;
}

export interface PublishPublicBlogSnapshotToBlobResult {
  releaseId: string;
  manifestUrl: string;
  postCount: number;
  categoryCount: number;
  managementReadback: true;
  publicReadback: true;
}

export class PublicBlogRemotePublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublicBlogRemotePublicationError';
  }
}

const PUBLIC_BLOG_RELEASE_ID_PATTERN = /^\d{8}T\d{6}Z-[a-f0-9]{12}$/;

export function isPublicBlogReleaseId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_BLOG_RELEASE_ID_PATTERN.test(value);
}

function assertReleaseApproval(actualReleaseId: string, expectedReleaseId: unknown): void {
  if (!isPublicBlogReleaseId(actualReleaseId) || !isPublicBlogReleaseId(expectedReleaseId)) {
    throw new PublicBlogRemotePublicationError('Public blog release approval is invalid');
  }
  const actual = Buffer.from(actualReleaseId, 'utf8');
  const expected = Buffer.from(expectedReleaseId, 'utf8');
  if (!timingSafeEqual(actual, expected)) {
    throw new PublicBlogRemotePublicationError(
      'Public blog release approval does not match candidate',
    );
  }
}

function parseJson(body: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    throw new PublicBlogRemotePublicationError(`Public blog ${label} readback is invalid`);
  }
}

function assertExactBody(
  readback: PublicBlogBlobManagementReadResult,
  expected: Uint8Array,
  label: string,
): void {
  if (readback.byteLength !== expected.byteLength
    || !readback.body.equals(Buffer.from(expected))) {
    throw new PublicBlogRemotePublicationError(`Public blog ${label} readback does not match`);
  }
}

/**
 * Publish the two immutable release objects first and move discovery last.
 * Successful return requires both token-authenticated origin reads and the
 * unauthenticated public reader to reproduce the exact built release.
 */
export async function publishPublicBlogSnapshotToBlob(
  input: PublishPublicBlogSnapshotToBlobInput,
): Promise<PublishPublicBlogSnapshotToBlobResult> {
  const now = input.now ?? new Date();
  const release = await buildPublicBlogSnapshotRelease(input.source, {
    now,
    publicationMode: input.publicationMode,
  });
  assertReleaseApproval(release.releaseId, input.expectedReleaseId);
  if (input.publicationMode === 'bootstrap-continuation') {
    if (!isPublicBlogReleaseId(input.expectedCurrentReleaseId)) {
      throw new PublicBlogRemotePublicationError(
        'Public blog bootstrap predecessor approval is invalid',
      );
    }
  } else if (input.expectedCurrentReleaseId !== undefined) {
    throw new PublicBlogRemotePublicationError(
      'Public blog bootstrap predecessor approval is not allowed',
    );
  }

  await input.store.putObject({
    kind: 'payload',
    key: release.payloadKey,
    body: release.payloadBody,
    sha256: sha256Hex(release.payloadBody),
  });
  await input.store.putObject({
    kind: 'release-manifest',
    key: release.releaseManifestKey,
    body: release.releaseManifestBody,
    sha256: sha256Hex(release.releaseManifestBody),
  });

  // Prove both immutable objects are complete and mutually bound before moving
  // the public discovery pointer. A partial or stale write can therefore leave
  // only unreachable release objects, never a broken current release.
  const [managementReleaseManifest, managementPayload] = await Promise.all([
    input.store.readObject({
      kind: 'release-manifest',
      key: release.releaseManifestKey,
      sha256: sha256Hex(release.releaseManifestBody),
    }),
    input.store.readObject({
      kind: 'payload',
      key: release.payloadKey,
      sha256: sha256Hex(release.payloadBody),
    }),
  ]);
  assertExactBody(managementReleaseManifest, release.releaseManifestBody, 'release manifest');
  assertExactBody(managementPayload, release.payloadBody, 'payload');

  const releaseManifestValue = parseJson(managementReleaseManifest.body, 'release manifest');
  const payloadValue = parseJson(managementPayload.body, 'payload');
  try {
    assertPublicBlogSnapshotManifest(releaseManifestValue, { now });
    assertPublicBlogSnapshotPayload(payloadValue, { now });
    assertPublicBlogPayloadMatchesManifest(payloadValue, releaseManifestValue);
  } catch (error) {
    if (error instanceof PublicBlogSnapshotValidationError) throw error;
    throw new PublicBlogRemotePublicationError('Public blog management readback is invalid');
  }

  await input.store.putObject({
    kind: 'discovery-manifest',
    key: release.manifestKey,
    body: release.manifestBody,
    sha256: sha256Hex(release.manifestBody),
    writePolicy: input.publicationMode === 'empty-bootstrap'
      ? { kind: 'empty-bootstrap-seed' }
      : input.publicationMode === 'bootstrap-continuation'
        ? {
          kind: 'bootstrap-continuation',
          expectedCurrentReleaseId: input.expectedCurrentReleaseId!,
        }
        : { kind: 'standard' },
  });
  const managementDiscovery = await input.store.readObject({
    kind: 'discovery-manifest',
    key: release.manifestKey,
    sha256: sha256Hex(release.manifestBody),
  });
  assertExactBody(managementDiscovery, release.manifestBody, 'discovery manifest');
  const discoveryValue = parseJson(managementDiscovery.body, 'discovery manifest');
  try {
    assertPublicBlogSnapshotManifest(discoveryValue, { now });
    assertPublicBlogPayloadMatchesManifest(payloadValue, discoveryValue);
  } catch (error) {
    if (error instanceof PublicBlogSnapshotValidationError) throw error;
    throw new PublicBlogRemotePublicationError('Public blog discovery readback is invalid');
  }
  if (stableJson(discoveryValue) !== stableJson(releaseManifestValue)) {
    throw new PublicBlogRemotePublicationError('Public blog manifest readbacks conflict');
  }

  let publicPayload;
  try {
    const reader = new PublicBlogSnapshotReader({
      baseUrl: input.store.publicBaseUrl,
      fetchImpl: input.publicFetchImpl,
      now: () => now,
    });
    publicPayload = await reader.getSnapshot();
  } catch (error) {
    if (error instanceof PublicBlogSnapshotValidationError) throw error;
    throw new PublicBlogRemotePublicationError('Public blog public readback failed');
  }
  if (stableJson(publicPayload) !== release.payloadBody.toString('utf8')) {
    throw new PublicBlogRemotePublicationError('Public blog public readback does not match release');
  }

  return {
    releaseId: release.releaseId,
    manifestUrl: new URL(PUBLIC_BLOG_MANIFEST_KEY, input.store.publicBaseUrl).toString(),
    postCount: release.payload.posts.length,
    categoryCount: release.payload.categories.length,
    managementReadback: true,
    publicReadback: true,
  };
}
