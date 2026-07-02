/**
 * mdxSanitizeSchema 특성테스트 (Y5) — XSS 방어 정책 데이터 고정.
 *
 * 실제 sanitize 실행은 admin 미리보기의 rehype-sanitize가 담당하고,
 * 이 테스트는 그 입력이 되는 "정책"을 정밀 고정한다.
 * 여기 항목이 바뀌면 공격 표면이 바뀌는 것 — 의도적 변경일 때만 갱신할 것.
 */
import { describe, it, expect } from 'vitest';
import { defaultSchema } from 'rehype-sanitize';
import { mdxSanitizeSchema } from '../sanitize-schema';

describe('위험 태그 차단 (defaultSchema 상속)', () => {
  it.each(['script', 'iframe', 'object', 'embed', 'form', 'base', 'meta'])(
    '%s 태그는 허용 목록에 없다',
    (tag) => {
      expect(mdxSanitizeSchema.tagNames).not.toContain(tag);
    },
  );

  it('input은 defaultSchema가 GFM 체크리스트용으로 허용 — 속성은 default 정책 그대로 상속', () => {
    // - [ ] 체크박스 렌더용. defaultSchema가 type/checked/disabled 수준으로 제한한다.
    expect(mdxSanitizeSchema.tagNames).toContain('input');
    expect(mdxSanitizeSchema.attributes?.input).toEqual(defaultSchema.attributes?.input);
  });
});

describe('의도적 확장 태그', () => {
  it('SVG 시각자료 태그 12종 허용', () => {
    for (const tag of [
      'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
      'text', 'g', 'defs', 'linearGradient', 'stop',
    ]) {
      expect(mdxSanitizeSchema.tagNames).toContain(tag);
    }
  });

  it('토글(details·summary) 허용', () => {
    expect(mdxSanitizeSchema.tagNames).toContain('details');
    expect(mdxSanitizeSchema.tagNames).toContain('summary');
  });

  it('GFM 표 태그 유지 (defaultSchema 기본)', () => {
    for (const tag of ['table', 'thead', 'tbody', 'tr', 'td', 'th']) {
      expect(mdxSanitizeSchema.tagNames).toContain(tag);
    }
  });
});

describe('속성 정책', () => {
  it('전역(*)에 className·style 추가 — 이벤트 핸들러(on*)는 어디에도 없다', () => {
    const all = mdxSanitizeSchema.attributes?.['*'] ?? [];
    expect(all).toContain('className');
    expect(all).toContain('style');

    for (const [, attrs] of Object.entries(mdxSanitizeSchema.attributes ?? {})) {
      for (const attr of attrs) {
        const name = typeof attr === 'string' ? attr : attr[0];
        expect(name.toLowerCase().startsWith('on')).toBe(false);
      }
    }
  });

  it('svg 허용 속성 고정 (공격 표면 정의)', () => {
    expect(mdxSanitizeSchema.attributes?.svg).toEqual([
      'viewBox', 'xmlns', 'fill', 'stroke', 'strokeWidth', 'width', 'height',
    ]);
  });

  it('linearGradient·stop·details 허용 속성 고정', () => {
    expect(mdxSanitizeSchema.attributes?.linearGradient).toEqual([
      'id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits',
    ]);
    expect(mdxSanitizeSchema.attributes?.stop).toEqual(['offset', 'stopColor', 'stopOpacity']);
    expect(mdxSanitizeSchema.attributes?.details).toEqual(['open']);
  });
});

describe('URL 프로토콜 정책 (javascript: 차단)', () => {
  it('protocols는 defaultSchema 그대로 상속 — javascript 프로토콜 없음', () => {
    expect(mdxSanitizeSchema.protocols).toEqual(defaultSchema.protocols);
    const hrefProtocols = mdxSanitizeSchema.protocols?.href ?? [];
    expect(hrefProtocols).not.toContain('javascript');
    expect(hrefProtocols).toContain('http');
    expect(hrefProtocols).toContain('https');
  });
});
