/**
 * parseRentXmlFull · molitItemToRentRow · collapseRentByKey 단위 테스트 —
 * 전월세 DB 적재. fixture 는 국토부 RTMSDataSvcAptRent 형태(축약):
 * 전세 1건 + 월세(갱신) 1건.
 */
import { describe, it, expect } from 'vitest';
import { parseRentXmlFull, molitItemToRentRow, buildRentDedupeKey } from '../molit-rent-parse';
import { collapseRentByKey } from '../rent-tx-upsert';

const XML = `
<response><body><items>
<item>
<aptNm>은마</aptNm><excluUseAr>84.43</excluUseAr><deposit>100,000</deposit><monthlyRent>0</monthlyRent>
<dealYear>2026</dealYear><dealMonth>6</dealMonth><dealDay>15</dealDay>
<floor>5</floor><buildYear>1979</buildYear><umdNm>대치동</umdNm><jibun>316</jibun>
<contractType>신규</contractType><preDeposit></preDeposit><preMonthlyRent></preMonthlyRent>
</item>
<item>
<aptNm>래미안대치팰리스</aptNm><excluUseAr>94.49</excluUseAr><deposit>50,000</deposit><monthlyRent>150</monthlyRent>
<dealYear>2026</dealYear><dealMonth>6</dealMonth><dealDay>3</dealDay>
<floor>12</floor><buildYear>2015</buildYear><umdNm>대치동</umdNm><jibun>1</jibun>
<contractType>갱신</contractType><preDeposit>45,000</preDeposit><preMonthlyRent>140</preMonthlyRent>
</item>
</items></body></response>`;

const CTX = { lawdCd: '11680', sigungu: '강남구' };

describe('parseRentXmlFull', () => {
  it('전체 필드 파싱 (전세·월세·갱신)', () => {
    const items = parseRentXmlFull(XML);
    expect(items).toHaveLength(2);
    expect(items[0].deposit).toBe('100,000');
    expect(items[0].monthlyRent).toBe('0');
    expect(items[1].contractType).toBe('갱신');
    expect(items[1].preDeposit).toBe('45,000');
  });
});

describe('molitItemToRentRow', () => {
  it('전세 매핑 — 보증금·월세0·계약일', () => {
    const row = molitItemToRentRow(parseRentXmlFull(XML)[0], CTX)!;
    expect(row.deposit).toBe(100000);
    expect(row.monthlyRent).toBe(0);
    expect(row.dealDate).toBe('2026-06-15');
    expect(row.sigungu).toBe('강남구');
    expect(row.dedupeKey).toHaveLength(32); // md5 hex
  });

  it('월세 갱신 매핑 — 종전가 보존', () => {
    const row = molitItemToRentRow(parseRentXmlFull(XML)[1], CTX)!;
    expect(row.monthlyRent).toBe(150);
    expect(row.contractType).toBe('갱신');
    expect(row.prevDeposit).toBe(45000);
    expect(row.prevMonthlyRent).toBe(140);
  });

  it('보증금 0(오류 데이터)은 null', () => {
    const bad = { ...parseRentXmlFull(XML)[0], deposit: '0' };
    expect(molitItemToRentRow(bad, CTX)).toBeNull();
  });

  it('재통보(계약구분만 늦게 확정)는 동일 dedupeKey', () => {
    const item = parseRentXmlFull(XML)[0];
    const a = molitItemToRentRow(item, CTX)!;
    const b = molitItemToRentRow({ ...item, contractType: '갱신' }, CTX)!;
    expect(b.dedupeKey).toBe(a.dedupeKey);
  });
});

describe('buildRentDedupeKey', () => {
  const base = {
    lawdCd: '11680', umdNm: '대치동', jibun: '316', aptNameNorm: '은마',
    areaM2: 84.43, floor: 5, dealDate: '2026-06-15', deposit: 100000, monthlyRent: 0,
  };
  it('결정적 + 면적 부동소수 오차 흡수', () => {
    expect(buildRentDedupeKey(base)).toBe(buildRentDedupeKey({ ...base, areaM2: 84.4300001 }));
  });
  it('보증금·월세가 다르면 다른 키', () => {
    expect(buildRentDedupeKey(base)).not.toBe(buildRentDedupeKey({ ...base, deposit: 90000 }));
    expect(buildRentDedupeKey(base)).not.toBe(buildRentDedupeKey({ ...base, monthlyRent: 50 }));
  });
});

describe('collapseRentByKey', () => {
  it('같은 키 병합 — 확정 속성(계약구분·종전가) last-wins 보강', () => {
    const item = parseRentXmlFull(XML)[0];
    const a = molitItemToRentRow(item, CTX)!;                                  // 신규
    const b = { ...a, contractType: null, prevDeposit: null };                 // 미확정 재통보
    const out = collapseRentByKey([b, a]);
    expect(out).toHaveLength(1);
    expect(out[0].contractType).toBe('신규');
  });
  it('다른 키는 보존', () => {
    const rows = parseRentXmlFull(XML).map((i) => molitItemToRentRow(i, CTX)!);
    expect(collapseRentByKey(rows)).toHaveLength(2);
  });
});
