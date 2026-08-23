import { describe, expect, it } from 'vitest';
import { metadata as newsMetadata } from '@/app/news/layout';
import { metadata as telegramMetadata } from '@/app/telegram/page';

describe('보조·외부 연결 페이지 색인 정책', () => {
  it('자동 수집 뉴스 페이지는 링크 탐색만 허용한다', () => {
    expect(newsMetadata.robots).toEqual({ index: false, follow: true });
  });

  it('텔레그램 경유 랜딩은 CTA를 유지하면서 색인하지 않는다', () => {
    expect(telegramMetadata.robots).toEqual({ index: false, follow: true });
  });
});
