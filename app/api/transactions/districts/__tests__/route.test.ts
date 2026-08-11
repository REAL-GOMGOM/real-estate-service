import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  fetchDistrictAggs: vi.fn(),
  isPublicSnapshotConfigured: vi.fn(),
}));

vi.mock('@/lib/agg-queries', () => ({ fetchDistrictAggs: mocks.fetchDistrictAggs }));
vi.mock('@/lib/public-snapshots/runtime', () => ({
  isPublicSnapshotConfigured: mocks.isPublicSnapshotConfigured,
}));

import { GET } from '../route';

describe('GET /api/transactions/districts serving truth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isPublicSnapshotConfigured.mockReturnValue(false);
    mocks.fetchDistrictAggs.mockResolvedValue([]);
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
