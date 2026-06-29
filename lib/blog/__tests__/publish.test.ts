import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 공유 발행 로직(lib/blog/publish.ts) 단위 테스트.
 *
 * DB는 @/lib/db/client 를 mock 해서 drizzle 체인을 가짜로 주입.
 * (server-only 로딩도 mock 으로 함께 회피됨)
 */

// drizzle update 체인 mock: db.update(t).set(v).where(c).returning(cols) => returningResult
const returningMock = vi.fn();
const whereMock = vi.fn(() => ({ returning: returningMock }));
const setMock = vi.fn(() => ({ where: whereMock }));
const updateMock = vi.fn(() => ({ set: setMock }));

vi.mock('@/lib/db/client', () => ({
  getBlogDb: () => ({ update: updateMock }),
}));

import { setPostPublished, setPostUnpublished, publishSetValues } from '../publish';
import { posts } from '@/lib/db/schema';

beforeEach(() => {
  returningMock.mockReset();
  whereMock.mockClear();
  setMock.mockClear();
  updateMock.mockClear();
});

describe('publishSetValues', () => {
  it('status=published 와 publishedAt COALESCE 표현식을 담은 객체를 반환', () => {
    const values = publishSetValues();
    expect(values.status).toBe('published');
    // publishedAt 은 drizzle sql 표현식 객체 (COALESCE(...))
    expect(values.publishedAt).toBeTruthy();
    expect(typeof values.publishedAt).toBe('object');
  });

  it('호출마다 새 객체를 반환 (공유 가변상태 방지)', () => {
    expect(publishSetValues()).not.toBe(publishSetValues());
  });
});

describe('setPostPublished', () => {
  it('정상 — published 로 전환하고 {id, slug} 반환', async () => {
    returningMock.mockResolvedValue([{ id: 'abc', slug: 'hello' }]);

    const result = await setPostPublished('abc');

    expect(result).toEqual({ id: 'abc', slug: 'hello' });
    expect(updateMock).toHaveBeenCalledWith(posts);
    // set 에 status=published 가 들어갔는지
    const setArg = (setMock.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(setArg.status).toBe('published');
    expect(setArg.publishedAt).toBeTruthy();
  });

  it('대상 글이 없으면 null 반환', async () => {
    returningMock.mockResolvedValue([]);
    const result = await setPostPublished('missing');
    expect(result).toBeNull();
  });
});

describe('setPostUnpublished', () => {
  it('정상 — draft 로 전환하고 {id} 반환', async () => {
    returningMock.mockResolvedValue([{ id: 'abc' }]);

    const result = await setPostUnpublished('abc');

    expect(result).toEqual({ id: 'abc' });
    const setArg = (setMock.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(setArg.status).toBe('draft');
  });

  it('대상 글이 없으면 null 반환', async () => {
    returningMock.mockResolvedValue([]);
    const result = await setPostUnpublished('missing');
    expect(result).toBeNull();
  });
});
