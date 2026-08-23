import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ErrorPage from '@/app/error';

describe('전역 오류 화면', () => {
  it('재시도와 홈 복구 경로를 함께 제공한다', () => {
    const html = renderToStaticMarkup(
      <ErrorPage error={new Error('temporary')} reset={vi.fn()} />,
    );

    expect(html).toContain('다시 시도');
    expect(html).toContain('href="/"');
    expect(html).toContain('홈으로 이동');
  });
});
