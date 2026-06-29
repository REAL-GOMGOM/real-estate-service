import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * slug 유틸 단위 테스트.
 * slugifyBase 는 순수 함수, ensureUniqueSlug 는 DB 조회 mock.
 */

// db.select({slug}).from(posts).where(cond) => whereResult (Promise<rows>)
const whereMock = vi.fn();
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));

vi.mock('@/lib/db/client', () => ({
  getBlogDb: () => ({ select: selectMock }),
}));

import {
  slugifyBase,
  ensureUniqueSlug,
  generateUniqueSlug,
  normalizeSlug,
} from '../slug';

beforeEach(() => {
  whereMock.mockReset();
  fromMock.mockClear();
  selectMock.mockClear();
});

describe('normalizeSlug', () => {
  it('영문 slug 정규화 (이미 깔끔하면 그대로)', () => {
    expect(normalizeSlug('gangnam-reconstruction-2026')).toBe(
      'gangnam-reconstruction-2026',
    );
  });

  it('대문자·공백·특수문자 정규화', () => {
    expect(normalizeSlug('Hello World!@#')).toBe('hello-world');
  });

  it('연속/양끝 하이픈 정리', () => {
    expect(normalizeSlug('  --Foo__Bar-- ')).toBe('foo-bar');
  });

  it('한글만 → 빈 문자열 (폴백 없음)', () => {
    expect(normalizeSlug('한글 제목')).toBe('');
  });

  it('특수문자만 → 빈 문자열', () => {
    expect(normalizeSlug('!@#$%')).toBe('');
  });
});

describe('slugifyBase', () => {
  it('영문 제목 → 하이픈 slug', () => {
    expect(slugifyBase('Hello World Post')).toBe('hello-world-post');
  });

  it('특수문자·연속공백 정리, 양끝 하이픈 제거', () => {
    expect(slugifyBase('  Foo -- Bar!! ')).toBe('foo-bar');
  });

  it('순수 한글 제목 → fallback "post"', () => {
    expect(slugifyBase('내집 칼럼 제목')).toBe('post');
  });

  it('빈 문자열 → fallback "post"', () => {
    expect(slugifyBase('')).toBe('post');
  });
});

describe('ensureUniqueSlug', () => {
  it('충돌 없음 → base 그대로', async () => {
    whereMock.mockResolvedValue([]);
    expect(await ensureUniqueSlug('hello')).toBe('hello');
  });

  it('base 충돌 → -2 부여', async () => {
    whereMock.mockResolvedValue([{ slug: 'hello' }]);
    expect(await ensureUniqueSlug('hello')).toBe('hello-2');
  });

  it('base, -2 충돌 → -3 부여', async () => {
    whereMock.mockResolvedValue([{ slug: 'hello' }, { slug: 'hello-2' }]);
    expect(await ensureUniqueSlug('hello')).toBe('hello-3');
  });

  it('중간 번호가 비면 가장 낮은 빈 번호 사용', async () => {
    // hello, hello-3 존재 → hello-2 가 빔
    whereMock.mockResolvedValue([{ slug: 'hello' }, { slug: 'hello-3' }]);
    expect(await ensureUniqueSlug('hello')).toBe('hello-2');
  });
});

describe('generateUniqueSlug', () => {
  it('한글 제목 + 충돌 → post-2', async () => {
    whereMock.mockResolvedValue([{ slug: 'post' }]);
    expect(await generateUniqueSlug('한글 제목')).toBe('post-2');
  });
});
