/**
 * parseTradeXml · molitItemToTransaction 단위 테스트 — Phase 2 (자체 DB 적재).
 * fixture 는 국토부 RTMSDataSvcAptTrade 응답 형태(축약): 정상 1건 + 해제 1건.
 */
import { describe, it, expect } from 'vitest';
import { parseTradeXml, molitItemToTransaction } from '../molit-trade-parse';

const XML = `
<response><body><items>
<item>
<aptNm>은마</aptNm><excluUseAr>84.43</excluUseAr><dealAmount>250,000</dealAmount>
<dealYear>2026</dealYear><dealMonth>6</dealMonth><dealDay>15</dealDay>
<floor>5</floor><buildYear>1979</buildYear><umdNm>대치동</umdNm><jibun>316</jibun>
<sggCd>11680</sggCd><cdealType> </cdealType><cdealDay> </cdealDay>
<dealingGbn>중개거래</dealingGbn><rgstDate>26.06.20</rgstDate>
</item>
<item>
<aptNm>래미안대치팰리스</aptNm><excluUseAr>94.49</excluUseAr><dealAmount>420,000</dealAmount>
<dealYear>2026</dealYear><dealMonth>6</dealMonth><dealDay>3</dealDay>
<floor>12</floor><buildYear>2015</buildYear><umdNm>대치동</umdNm><jibun>1</jibun>
<sggCd>11680</sggCd><cdealType>O</cdealType><cdealDay>26.06.28</cdealDay>
<dealingGbn>중개거래</dealingGbn><rgstDate></rgstDate>
</item>
</items></body></response>`;

const CTX = { lawdCd: '11680', sigungu: '강남구' };

describe('parseTradeXml', () => {
  it('모든 item 을 전체 필드로 파싱', () => {
    const items = parseTradeXml(XML);
    expect(items).toHaveLength(2);
    expect(items[0].aptNm).toBe('은마');
    expect(items[0].jibun).toBe('316');
    expect(items[1].cdealType).toBe('O');
    expect(items[1].cdealDay).toBe('26.06.28');
  });

  it('item 없으면 빈 배열 (fail-open)', () => {
    expect(parseTradeXml('<response/>')).toEqual([]);
  });
});

describe('molitItemToTransaction', () => {
  it('정상 거래 매핑 — 금액·면적·계약일·시군구·취소여부', () => {
    const tx = molitItemToTransaction(parseTradeXml(XML)[0], CTX)!;
    expect(tx.dealAmount).toBe(250000);
    expect(tx.areaM2).toBeCloseTo(84.43);
    expect(tx.dealDate).toBe('2026-06-15');
    expect(tx.sigungu).toBe('강남구');
    expect(tx.aptNameNorm).toBe('은마');
    expect(tx.isCanceled).toBe(false);
  });

  it('해제 거래 — isCanceled=true, canceledDate 원문 보존', () => {
    const tx = molitItemToTransaction(parseTradeXml(XML)[1], CTX)!;
    expect(tx.isCanceled).toBe(true);
    expect(tx.canceledDate).toBe('26.06.28');
  });

  it('해제 통보는 원거래와 같은 dedupeKey — 신규 행이 아니라 UPDATE 되도록', () => {
    const normal = parseTradeXml(XML)[0];
    const tx1 = molitItemToTransaction(normal, CTX)!;
    // 같은 물리 거래가 해제 플래그만 붙어 재적재된 상황 모사
    const tx2 = molitItemToTransaction(
      { ...normal, cdealType: 'O', cdealDay: '26.07.01' },
      CTX,
    )!;
    expect(tx2.dedupeKey).toBe(tx1.dedupeKey);
    expect(tx1.isCanceled).toBe(false);
    expect(tx2.isCanceled).toBe(true);
  });

  it('필수값(금액) 누락 시 null', () => {
    const bad = { ...parseTradeXml(XML)[0], dealAmount: '' };
    expect(molitItemToTransaction(bad, CTX)).toBeNull();
  });
});
