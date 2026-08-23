import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchDistrictAggs: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
  getNamedArtifact: vi.fn(),
  assertRolling30DistrictsEnvelope: vi.fn(),
}));

vi.mock('@/lib/agg-queries', () => ({ fetchDistrictAggs: mocks.fetchDistrictAggs }));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
  createPublicSnapshotRuntimeFromEnv: () => ({ getNamedArtifact: mocks.getNamedArtifact }),
}));
vi.mock('@/lib/public-snapshots/district-artifact', () => ({
  DISTRICT_ROLLING30_ARTIFACT_NAME: 'districts/rolling30',
  assertRolling30DistrictsEnvelope: mocks.assertRolling30DistrictsEnvelope,
}));
vi.mock('@/lib/public-snapshots/serving-artifacts', () => ({
  TRANSACTION_SNAPSHOT_MAX_AGE_MS: 48 * 60 * 60 * 1000,
  isServingArtifactFresh: () => true,
}));

import { GET } from '../route';

describe('GET /api/transactions/districts serving truth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T00:00:00.000Z'));
    vi.clearAllMocks();
    mocks.isPublicSnapshotConfigured.mockReturnValue(false);
    mocks.fetchDistrictAggs.mockResolvedValue([]);
    mocks.getNamedArtifact.mockResolvedValue({ status: 'disabled', reason: 'base-url-not-configured' });
  });

  afterEach(() => vi.useRealTimers());

  it('serves and sorts the rolling30 district snapshot without querying Neon', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);
    mocks.getNamedArtifact.mockResolvedValue({
      status: 'success',
      data: {
        generatedAt: '2026-08-23T00:00:00.000Z',
        data: {
          month: '202608',
          window: { type: 'rolling30', from: '2026-07-25', to: '2026-08-24' },
          districts: [
            { district: '서초구', count: 2, newHighs: 0 },
            { district: '강남구', count: 5, newHighs: 1 },
            { district: '수원시 영통구', count: 99, newHighs: 10 },
          ],
        },
      },
    });

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/districts?group=%EC%84%9C%EC%9A%B8',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Naezip-Data-Source')).toBe('snapshot');
    expect(body.districts).toEqual([
      { district: '강남구', count: 5, newHighs: 1 },
      { district: '서초구', count: 2, newHighs: 0 },
    ]);
    expect(mocks.fetchDistrictAggs).not.toHaveBeenCalled();
  });

  it('configured serving mode returns empty stats without querying stale DB aggregates', async () => {
    mocks.isPublicSnapshotConfigured.mockReturnValue(true);

    const response = await GET(new NextRequest(
      'http://localhost/api/transactions/districts?group=%EC%84%9C%EC%9A%B8',
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.group).toBe('서울');
    expect(body.districts).toEqual([]);
    expect(body.note).toContain('준비 중');
    expect(mocks.fetchDistrictAggs).not.toHaveBeenCalled();
  });

  it('without snapshot configuration preserves the existing DB aggregate path', async () => {
    await GET(new NextRequest(
      'http://localhost/api/transactions/districts?group=%EC%84%9C%EC%9A%B8',
    ));

    expect(mocks.fetchDistrictAggs).toHaveBeenCalledOnce();
  });
});
