import { describe, expect, it } from 'vitest';

import { DISTRICT_GROUPS } from '../../district-groups';
import {
  DISTRICT_ROLLING30_ARTIFACT_NAME,
  DISTRICT_ROLLING30_SCHEMA,
  assertRolling30DistrictsEnvelope,
  buildRolling30DistrictsArtifact,
} from '../district-artifact';

const GENERATED_AT = '2026-08-22T20:12:36.971Z';

describe('rolling30 district serving artifact', () => {
  it('publishes every registered district in canonical order and fills missing rows with zero', () => {
    const artifact = buildRolling30DistrictsArtifact({
      generatedAt: GENERATED_AT,
      from: '2026-07-25',
      to: '2026-08-24',
      buy: [{ sigungu: '강남구', cnt: 12, newHighs: 2, sum59: 0, cnt59: 0, sum84: 0, cnt84: 0 }],
    });
    const envelope = {
      schema: artifact.schema,
      generatedAt: GENERATED_AT,
      itemCount: artifact.itemCount,
      data: artifact.data,
    };

    expect(artifact).toMatchObject({
      name: DISTRICT_ROLLING30_ARTIFACT_NAME,
      schema: DISTRICT_ROLLING30_SCHEMA,
      data: { status: 'ok', month: '202608' },
    });
    expect(artifact.itemCount).toBe(DISTRICT_GROUPS.flatMap((group) => group.districts).length);
    expect(artifact.data.districts.find((row) => row.district === '강남구'))
      .toEqual({ district: '강남구', count: 12, newHighs: 2 });
    expect(artifact.data.districts.find((row) => row.district === '서초구'))
      .toEqual({ district: '서초구', count: 0, newHighs: 0 });
    expect(() => assertRolling30DistrictsEnvelope(envelope)).not.toThrow();
  });

  it('rejects missing rows, changed order, impossible counts, and envelope mismatches', () => {
    const artifact = buildRolling30DistrictsArtifact({
      generatedAt: GENERATED_AT,
      from: '2026-07-25',
      to: '2026-08-24',
      buy: [],
    });
    const envelope = {
      schema: artifact.schema,
      generatedAt: GENERATED_AT,
      itemCount: artifact.itemCount,
      data: artifact.data,
    };

    expect(() => assertRolling30DistrictsEnvelope({
      ...envelope,
      data: { ...envelope.data, districts: envelope.data.districts.slice(1) },
    })).toThrow('incomplete');

    const reordered = structuredClone(envelope);
    [reordered.data.districts[0], reordered.data.districts[1]] = [
      reordered.data.districts[1], reordered.data.districts[0],
    ];
    expect(() => assertRolling30DistrictsEnvelope(reordered)).toThrow('out of order');

    const impossible = structuredClone(envelope);
    impossible.data.districts[0].newHighs = 1;
    expect(() => assertRolling30DistrictsEnvelope(impossible)).toThrow('exceeds count');

    expect(() => assertRolling30DistrictsEnvelope({ ...envelope, itemCount: 1 }))
      .toThrow('does not match');
  });
});
