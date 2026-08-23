import { NextRequest, NextResponse } from 'next/server';
import { DISTRICT_GROUPS } from '@/lib/district-groups';
import { resolveAggWindow, kstCurrentYyyymm } from '@/lib/agg-window';
import { fetchDistrictAggs } from '@/lib/agg-queries';
import {
  createPublicSnapshotRuntimeFromEnv,
  isPublicSnapshotConfigured,
} from '@/lib/public-snapshots/runtime';
import {
  DISTRICT_ROLLING30_ARTIFACT_NAME,
  assertRolling30DistrictsEnvelope,
} from '@/lib/public-snapshots/district-artifact';
import {
  TRANSACTION_SNAPSHOT_MAX_AGE_MS,
  isServingArtifactFresh,
} from '@/lib/public-snapshots/serving-artifacts';

/**
 * 구별 거래 현황 API — SQL 푸시다운 전환 (2026-08-02).
 *
 * 기존(7/19 버전): 그룹 내 전 구의 당월 원장 행 전체 전송 → JS 집계.
 * 개편: Postgres 집계 결과만 전송 + ?window=rolling30(기본)|YYYYMM.
 *
 * 버그 픽스: 기존 "간이 신고가"(latest >= max)는 거래 1건짜리 단지도
 * 전부 신고가로 세던 옛 버그(summary 는 7월에 수정, 여기엔 미반영)를
 * 그대로 갖고 있었다. countNewHighs 와 동일 의미론(2건 이상 &&
 * 직전 최고가 '초과')으로 통일 — 구 칩 신고가 수치가 낮아지는 게 정상.
 */

export async function GET(req: NextRequest) {
  const groupLabel = req.nextUrl.searchParams.get('group')?.trim() ?? '';
  const group = DISTRICT_GROUPS.find((g) => g.label === groupLabel);
  if (!group) {
    return NextResponse.json({ error: '지원하지 않는 그룹: ' + groupLabel }, { status: 400 });
  }

  const window = resolveAggWindow(req.nextUrl.searchParams.get('window'));
  if (!window) {
    return NextResponse.json(
      { error: 'window 는 rolling30 또는 YYYYMM(미래 월 불가) 형식입니다.' },
      { status: 400 },
    );
  }
  const yyyymm = window.type === 'month' ? window.yyyymm! : kstCurrentYyyymm();

  const servingMode = isPublicSnapshotConfigured();
  if (window.type === 'rolling30') {
    try {
      const snapshot = await createPublicSnapshotRuntimeFromEnv()
        .getNamedArtifact(DISTRICT_ROLLING30_ARTIFACT_NAME);
      if (snapshot.status === 'success') {
        try {
          assertRolling30DistrictsEnvelope(snapshot.data);
          if (snapshot.data.data.window.to <= window.to
            && isServingArtifactFresh(snapshot.data.generatedAt, {
              maxAgeMs: TRANSACTION_SNAPSHOT_MAX_AGE_MS,
            })) {
            const districtSet = new Set(group.districts);
            const districts = snapshot.data.data.districts
              .filter((row) => districtSet.has(row.district))
              .sort((left, right) => right.count - left.count || left.district.localeCompare(right.district));
            return NextResponse.json(
              {
                group: group.label,
                month: snapshot.data.data.month,
                window: snapshot.data.data.window,
                districts,
              },
              {
                headers: {
                  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
                  'X-Naezip-Data-Source': 'snapshot',
                  'X-Naezip-Snapshot-Generated-At': snapshot.data.generatedAt,
                },
              },
            );
          }
        } catch {
          // Invalid artifacts are unavailable, never authoritative.
        }
      }
    } catch {
      // Runtime failures use the configured fail-closed response below.
    }
  }

  // In configured serving mode, do not present an older Neon aggregate as current truth.
  if (servingMode) {
    return NextResponse.json(
      {
        group: group.label,
        month: yyyymm,
        window: { type: window.type, from: window.from, to: window.to },
        districts: [],
        note: '검증된 지역 통계를 준비 중입니다. 지역 선택은 계속 사용할 수 있습니다.',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
    );
  }

  try {
    const aggRows = await fetchDistrictAggs(window.from, window.to);
    const byDistrict = new Map(aggRows.map((r) => [r.sigungu, r]));

    const districts = group.districts.map((district) => {
      const e = byDistrict.get(district);
      return { district, count: e?.cnt ?? 0, newHighs: e?.newHighs ?? 0 };
    });

    // 아실형: 건수 많은 순 정렬
    districts.sort((a, b) => b.count - a.count);

    return NextResponse.json(
      {
        group: group.label,
        month: yyyymm,
        window: { type: window.type, from: window.from, to: window.to },
        districts,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (error) {
    // DB 불가 시 빈 목록 강등 (500 방지) — 짧은 캐시로 복구 시 빠른 재반영
    console.error('[transactions/districts API] 집계 실패 — 빈 목록 강등:', error);
    return NextResponse.json(
      {
        group: group.label,
        month: yyyymm,
        districts: [],
        note: '집계 데이터 일시 점검 중입니다. 잠시 후 다시 확인해주세요.',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  }
}
