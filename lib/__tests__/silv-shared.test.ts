import { describe, it, expect } from 'vitest';
import { parseSilvXml, groupSilvTransactions } from '@/lib/silv-shared';

/** 테스트용 MOLIT item XML 생성 */
function item(o: Record<string, string>): string {
  return `<item>${Object.entries(o).map(([k, v]) => `<${k}>${v}</${k}>`).join('')}</item>`;
}

describe('parseSilvXml — 분양권 파싱', () => {
  it('정상 item 파싱 (면적 반올림·계약일 조립)', () => {
    const xml = item({
      dealAmount: '50,000', excluUseAr: '84.9', aptNm: '어울림',
      dealYear: '2026', dealMonth: '7', dealDay: '5', floor: '10', umdNm: '삼성동',
    });
    const txs = parseSilvXml(xml, '강남구');
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      aptName: '어울림', district: '강남구', dong: '삼성동',
      area: 85, floor: 10, price: 50000, date: '2026-07-05',
    });
  });

  it('필수 필드(가격·면적·단지·연도) 없으면 제외', () => {
    expect(parseSilvXml(item({ dealAmount: '', excluUseAr: '84', aptNm: 'X', dealYear: '2026' }), '강남구')).toHaveLength(0);
    expect(parseSilvXml(item({ dealAmount: '5000', excluUseAr: '0', aptNm: 'X', dealYear: '2026' }), '강남구')).toHaveLength(0);
  });

  it('해제 거래와 XML 엔티티를 올바르게 처리한다', () => {
    const canceled = item({
      dealAmount: '50000', excluUseAr: '84', aptNm: 'A', dealYear: '2026',
      dealMonth: '7', dealDay: '1', umdNm: '삼성동', cdealType: 'O',
    });
    const active = item({
      dealAmount: '50000', excluUseAr: '84', aptNm: 'A&amp;B', dealYear: '2026',
      dealMonth: '7', dealDay: '1', umdNm: '삼성동', cdealType: '',
    });

    expect(parseSilvXml(canceled, '강남구')).toHaveLength(0);
    expect(parseSilvXml(active, '강남구')[0].aptName).toBe('A&B');
  });

  it('같은 원거래와 해제 item이 함께 오면 원거래까지 제외한다', () => {
    const base = {
      dealAmount: '50,000', excluUseAr: '84.00', aptNm: '취소단지',
      dealYear: '2026', dealMonth: '7', dealDay: '1', floor: '10',
      umdNm: '삼성동', jibun: '1-1',
    };
    const active = item({ ...base, cdealType: '' });
    const canceled = item({ ...base, cdealType: 'O' });

    expect(parseSilvXml(active + canceled, '강남구')).toEqual([]);
    expect(parseSilvXml(canceled + active, '강남구')).toEqual([]);
  });

  it('그룹핑 — 단지별 묶음·면적 수집', () => {
    const txs = parseSilvXml(
      item({ dealAmount: '50000', excluUseAr: '84', aptNm: 'A', dealYear: '2026', dealMonth: '7', dealDay: '1', floor: '5', umdNm: 'd' }) +
      item({ dealAmount: '52000', excluUseAr: '84', aptNm: 'A', dealYear: '2026', dealMonth: '7', dealDay: '3', floor: '6', umdNm: 'd' }) +
      item({ dealAmount: '40000', excluUseAr: '59', aptNm: 'B', dealYear: '2026', dealMonth: '7', dealDay: '2', floor: '3', umdNm: 'd' }),
      '강남구',
    );
    const groups = groupSilvTransactions(txs);
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.name === 'A')!;
    expect(a.transactions).toHaveLength(2);
    expect(a.areas).toEqual([84]);
  });

  it('이름이 같아도 법정동이 다르면 별도 단지로 묶는다', () => {
    const txs = parseSilvXml(
      item({ dealAmount: '50000', excluUseAr: '84', aptNm: '현대', dealYear: '2026', dealMonth: '7', dealDay: '1', umdNm: '압구정동' }) +
      item({ dealAmount: '40000', excluUseAr: '84', aptNm: '현대', dealYear: '2026', dealMonth: '7', dealDay: '2', umdNm: '대치동' }),
      '강남구',
    );

    expect(groupSilvTransactions(txs)).toHaveLength(2);
  });
});
