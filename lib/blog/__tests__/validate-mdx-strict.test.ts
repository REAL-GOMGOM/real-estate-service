import { describe, it, expect } from 'vitest';
import { validateMdxStrict } from '../validate-mdx';

/**
 * validateMdxStrict 단위 테스트.
 * 등록 컴포넌트만 쓰면 통과 / 미등록 컴포넌트 참조 거부 / 문법오류 거부.
 */

describe('validateMdxStrict', () => {
  it('표준 markdown 통과', async () => {
    const result = await validateMdxStrict('# 제목\n\n본문 문단.');
    expect(result.ok).toBe(true);
  });

  it('등록된 컴포넌트(LineChart) 사용 통과', async () => {
    const result = await validateMdxStrict(
      '본문\n\n<LineChart data={[]} />\n\n끝',
    );
    expect(result.ok).toBe(true);
  });

  it('소문자 HTML 태그는 컴포넌트로 보지 않음 → 통과', async () => {
    const result = await validateMdxStrict('<div>일반 div</div>');
    expect(result.ok).toBe(true);
  });

  it('미등록 컴포넌트(<Foo/>) 참조 거부 + 이름 명시', async () => {
    const result = await validateMdxStrict('본문\n\n<Foo bar="x" />');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Foo');
      expect(result.error).toContain('미등록 컴포넌트');
    }
  });

  it('등록+미등록 혼용 시 미등록만 보고', async () => {
    const result = await validateMdxStrict(
      '<LineChart data={[]} />\n\n<EvilWidget />',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('EvilWidget');
      expect(result.error).not.toContain('LineChart');
    }
  });

  it('문법 오류(미종료 JSX) 거부', async () => {
    const result = await validateMdxStrict('본문\n\n<div>안 닫음');
    expect(result.ok).toBe(false);
  });

  it('빈 본문 거부', async () => {
    const result = await validateMdxStrict('');
    expect(result).toEqual({ ok: false, error: '본문이 비어 있습니다' });
  });
});
