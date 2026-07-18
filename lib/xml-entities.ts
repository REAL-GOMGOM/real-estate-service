/**
 * MOLIT XML 엔티티 디코드 — 검색개선 후속 (2026-07-17).
 *
 * 국토부 XML 은 단지명의 '&' 를 '&amp;' 로 이스케이프해 내려준다
 * (예: 철산역롯데캐슬&amp;SKVIEW클래스티지). 파서가 그대로 저장하면
 * 화면에 '&amp;' 가 노출되고 마스터(K-apt, 실문자 '&') 매칭도 어긋난다.
 * 모든 MOLIT 파서의 단지명 추출 지점에서 이 함수를 통과시킨다.
 *
 * 디코드 순서: &amp; 를 마지막에 — '&amp;lt;' 같은 이중 이스케이프를
 * 잘못 풀지 않는 표준 순서.
 */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
