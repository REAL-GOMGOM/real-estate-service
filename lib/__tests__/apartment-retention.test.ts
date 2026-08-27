import { describe, expect, it } from 'vitest';
import {
  decodeApartmentRetentionSnapshot,
  parseRetainedApartments,
  toggleRetainedFavorite,
  upsertRetainedApartment,
} from '../apartment-retention';

const apartment = {
  id: 'A100',
  name: '은하마을(주공1)',
  district: '부천시 원미구',
  dong: '중동',
};

describe('apartment retention', () => {
  it('최근 본 단지를 최신순으로 올리고 같은 단지는 중복 저장하지 않는다', () => {
    const older = upsertRetainedApartment([], apartment, '2026-08-20T00:00:00.000Z');
    const withSecond = upsertRetainedApartment(older, { ...apartment, id: 'A200', name: '다른 단지' }, '2026-08-21T00:00:00.000Z');
    const revisited = upsertRetainedApartment(withSecond, apartment, '2026-08-22T00:00:00.000Z');

    expect(revisited.map((item) => item.id)).toEqual(['A100', 'A200']);
    expect(revisited[0].updatedAt).toBe('2026-08-22T00:00:00.000Z');
  });

  it('관심 단지는 같은 버튼으로 저장하고 해제한다', () => {
    const added = toggleRetainedFavorite([], apartment, '2026-08-22T00:00:00.000Z');
    expect(added.isFavorite).toBe(true);
    expect(added.favorites).toHaveLength(1);

    const removed = toggleRetainedFavorite(added.favorites, apartment, '2026-08-23T00:00:00.000Z');
    expect(removed).toEqual({ favorites: [], isFavorite: false });
  });

  it('손상되거나 중복된 로컬 저장소 항목은 안전하게 버린다', () => {
    const raw = JSON.stringify([
      { ...apartment, updatedAt: '2026-08-22T00:00:00.000Z' },
      { ...apartment, name: '중복', updatedAt: '2026-08-21T00:00:00.000Z' },
      { id: '', name: '손상', district: '강남구', dong: null, updatedAt: 'invalid' },
    ]);
    expect(parseRetainedApartments(raw)).toEqual([
      { ...apartment, updatedAt: '2026-08-22T00:00:00.000Z' },
    ]);
    expect(parseRetainedApartments('{broken')).toEqual([]);
  });

  it('서버 기본 스냅샷은 빈 목록으로 해석한다', () => {
    expect(decodeApartmentRetentionSnapshot('')).toEqual({ favorites: [], recent: [] });
  });
});
