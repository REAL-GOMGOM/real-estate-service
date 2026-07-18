/**
 * decodeXmlEntities 단위 테스트 — 검색개선 후속.
 * 실사례: 철산역롯데캐슬&amp;SKVIEW클래스티지 (국토부 XML 이스케이프).
 */
import { describe, it, expect } from 'vitest';
import { decodeXmlEntities } from '../xml-entities';
import { parseTradeXml } from '../molit-trade-parse';

describe('decodeXmlEntities', () => {
  it('&amp; → & (실사례 단지명)', () => {
    expect(decodeXmlEntities('철산역롯데캐슬&amp;SKVIEW클래스티지'))
      .toBe('철산역롯데캐슬&SKVIEW클래스티지');
  });

  it('기타 엔티티 디코드', () => {
    expect(decodeXmlEntities('&lt;a&gt; &quot;b&quot; &#39;c&#39;')).toBe(`<a> "b" 'c'`);
  });

  it('이중 이스케이프는 한 겹만 해제 (&amp;lt; → &lt;)', () => {
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;');
  });

  it('엔티티 없는 이름은 그대로', () => {
    expect(decodeXmlEntities('래미안대치팰리스')).toBe('래미안대치팰리스');
  });
});

describe('parseTradeXml 엔티티 통합', () => {
  it('aptNm 의 &amp; 가 디코드되어 파싱됨', () => {
    const xml = `<item><aptNm>철산역롯데캐슬&amp;SKVIEW클래스티지</aptNm><excluUseAr>59.9</excluUseAr>
<dealAmount>90,000</dealAmount><dealYear>2026</dealYear><dealMonth>7</dealMonth><dealDay>1</dealDay>
<floor>10</floor><buildYear>2022</buildYear><umdNm>철산동</umdNm><jibun>100</jibun>
<sggCd>41210</sggCd><cdealType> </cdealType><cdealDay> </cdealDay>
<dealingGbn>중개거래</dealingGbn><rgstDate></rgstDate></item>`;
    expect(parseTradeXml(xml)[0].aptNm).toBe('철산역롯데캐슬&SKVIEW클래스티지');
  });
});
