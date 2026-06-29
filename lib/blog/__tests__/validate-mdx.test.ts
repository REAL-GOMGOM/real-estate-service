import { describe, it, expect } from 'vitest';
import { validateMdx } from '../validate-mdx';

/**
 * validateMdx 단위 테스트.
 * 정상 markdown/MDX 는 통과, 깨진 JSX 는 거부.
 */

describe('validateMdx', () => {
  it('정상 markdown 통과', async () => {
    const result = await validateMdx('# 제목\n\n본문 문단입니다.');
    expect(result.ok).toBe(true);
  });

  it('정상 MDX(JSX 표현식) 통과', async () => {
    const result = await validateMdx('텍스트 {1 + 1} 끝');
    expect(result.ok).toBe(true);
  });

  it('빈 본문 거부', async () => {
    const result = await validateMdx('');
    expect(result).toEqual({ ok: false, error: '본문이 비어 있습니다' });
  });

  it('깨진 JSX(미종료 태그) 거부 + 에러 문자열 반환', async () => {
    const result = await validateMdx('정상 텍스트\n\n<div>닫지 않은 태그');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('잘못된 JSX 표현식 거부', async () => {
    const result = await validateMdx('텍스트 {= 잘못된 표현식}');
    expect(result.ok).toBe(false);
  });
});
