import { describe, expect, it } from 'vitest';
import { parseGapRentsXml, parseGapTradesXml, selectGapRows } from '@/lib/gap-analysis-data';

const trade = (overrides = '') => `<item>
  <aptNm>래미안</aptNm><umdNm>대치동</umdNm><jibun>1</jibun>
  <excluUseAr>84.97</excluUseAr><floor>10</floor><dealAmount>200,000</dealAmount>
  <dealYear>2026</dealYear><dealMonth>8</dealMonth><dealDay>3</dealDay>${overrides}
</item>`;

describe('gap analysis MOLIT parser', () => {
  it('해제 거래는 같은 자연키의 원거래까지 제외한다', () => {
    const xml = `<response><totalCount>2</totalCount>${trade()}${trade('<cdealType>O</cdealType><cdealDay>20260805</cdealDay>')}</response>`;
    expect(parseGapTradesXml(xml)).toEqual([]);
  });

  it('동명이단지와 다른 전용면적을 섞지 않는다', () => {
    const rows = [
      { name: '래미안', dong: '대치동', area: 84.97 },
      { name: '래미안', dong: '도곡동', area: 84.9 },
      { name: '래미안 2차', dong: '대치동', area: 84.9 },
      { name: '래미안', dong: '대치동', area: 59.9 },
    ];
    expect(selectGapRows(rows, { name: '래미안', dong: '대치동', size: 84.9 })).toEqual([rows[0]]);
  });

  it('월세 계약은 전세 평균에서 제외한다', () => {
    const xml = `<response><totalCount>2</totalCount>
      <item><aptNm>A</aptNm><umdNm>가동</umdNm><deposit>50,000</deposit><monthlyRent>0</monthlyRent><excluUseAr>84.9</excluUseAr><dealYear>2026</dealYear><dealMonth>8</dealMonth><dealDay>1</dealDay></item>
      <item><aptNm>A</aptNm><umdNm>가동</umdNm><deposit>10,000</deposit><monthlyRent>150</monthlyRent><excluUseAr>84.9</excluUseAr><dealYear>2026</dealYear><dealMonth>8</dealMonth><dealDay>2</dealDay></item>
    </response>`;
    expect(parseGapRentsXml(xml)).toHaveLength(1);
    expect(parseGapRentsXml(xml)[0].deposit).toBe(50_000);
  });

  it('오류 XML을 거래 0건으로 취급하지 않는다', () => {
    expect(() => parseGapTradesXml('<OpenAPI_ServiceResponse>error</OpenAPI_ServiceResponse>')).toThrow();
  });
});
