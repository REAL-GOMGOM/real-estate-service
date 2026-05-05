/**
 * MDX 발행 페이지 sanitize 정책 — defaultSchema 확장
 *
 * 정책 출처:
 * - hast-util-sanitize defaultSchema (https://github.com/syntax-tree/hast-util-sanitize)
 * - GitHub Flavored Markdown 호환
 *
 * 허용 (사이트 콘텐츠 표현용):
 * - GFM 표 (table·thead·tbody·tr·td·th — defaultSchema 기본 포함)
 * - SVG 시각자료 (svg·path·circle·rect·line·polyline·polygon·text·g·defs·linearGradient·stop)
 * - 토글 (details·summary)
 * - className·style (시각 디자인용)
 *
 * 차단:
 * - script·iframe·object·embed (defaultSchema 기본 차단)
 * - on* 이벤트 핸들러
 * - javascript: 프로토콜 URL
 *
 * 본 schema는 발행 페이지 전용. 미리보기 렌더러 통합·디자인 토큰 매핑은 별도 PR.
 *
 * 사이클 A 시점: raw HTML 미허용(rehype-raw 미사용). svg·details 허용 태그 정의는
 * 사이클 A2(rehype-raw 추가) 시 즉시 활성되도록 미래 prep.
 */
import { defaultSchema } from 'rehype-sanitize';
import type { Schema } from 'hast-util-sanitize';

export const mdxSanitizeSchema: Schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon',
    'text', 'g', 'defs', 'linearGradient', 'stop',
    'details', 'summary',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'className', 'style',
    ],
    svg: ['viewBox', 'xmlns', 'fill', 'stroke', 'strokeWidth', 'width', 'height'],
    path: ['d', 'fill', 'stroke', 'strokeWidth', 'fillRule', 'clipRule', 'transform',
           'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'opacity'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'strokeWidth',
             'strokeLinecap', 'strokeDasharray', 'opacity'],
    rect: ['x', 'y', 'width', 'height', 'fill', 'stroke', 'rx', 'ry',
           'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'opacity'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth',
           'strokeLinecap', 'strokeDasharray', 'opacity'],
    polyline: ['points', 'fill', 'stroke', 'strokeWidth',
               'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'opacity'],
    polygon: ['points', 'fill', 'stroke', 'strokeWidth',
              'strokeLinecap', 'strokeLinejoin', 'strokeDasharray', 'opacity'],
    text: ['x', 'y', 'fill', 'fontSize', 'textAnchor', 'dominantBaseline',
           'fontWeight', 'fontFamily', 'opacity'],
    g: ['transform', 'fill', 'stroke', 'opacity'],
    defs: [],
    linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits'],
    stop: ['offset', 'stopColor', 'stopOpacity'],
    details: ['open'],
    summary: [],
  },
};
