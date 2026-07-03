/**
 * normalizeMLTMName 단위 테스트 — "실거래 데이터 품질" Phase 1.
 * fixture는 인계 문서의 실제 문제 사례 기반.
 */
import { describe, it, expect } from 'vitest';
import { normalizeMLTMName } from '../normalize-mltm-name';

describe('괄호 표기 제거', () => {
  it('동 괄호 제거 (실사례: 쌍용스위닷홈)', () => {
    expect(normalizeMLTMName('쌍용스위닷홈(201동)')).toBe('쌍용스위닷홈');
    expect(normalizeMLTMName('쌍용스윗닷홈(104동)')).toBe('쌍용스윗닷홈');
  });

  it('오타 통합은 범위 밖 — 정제 후에도 두 표기는 별개 (Phase 2 alias 대상)', () => {
    expect(normalizeMLTMName('쌍용스위닷홈(201동)')).not.toBe(
      normalizeMLTMName('쌍용스윗닷홈(104동)'),
    );
  });

  it('일반 괄호 표기 제거 (상가·재건축 등)', () => {
    expect(normalizeMLTMName('한신공영(도시형)')).toBe('한신공영');
    expect(normalizeMLTMName('삼익 (주상복합)')).toBe('삼익');
  });

  it('전각 괄호도 처리', () => {
    expect(normalizeMLTMName('현대（임대）')).toBe('현대');
  });

  it('괄호 안이 차수/단지면 언랩해 부착', () => {
    expect(normalizeMLTMName('래미안(1차)')).toBe('래미안1차');
    expect(normalizeMLTMName('주공(3단지)')).toBe('주공3단지');
    expect(normalizeMLTMName('주공( 3 단지 )')).toBe('주공3단지');
  });
});

describe('후행 동(棟) 제거', () => {
  it('숫자+동이 이름 끝이면 제거', () => {
    expect(normalizeMLTMName('현대아파트101동')).toBe('현대아파트');
    expect(normalizeMLTMName('우방1차 103동')).toBe('우방1차');
  });

  it('지명의 ~동은 오탐하지 않음 (숫자 없이 동으로 끝나는 이름)', () => {
    expect(normalizeMLTMName('신동아')).toBe('신동아');
    expect(normalizeMLTMName('이동미주')).toBe('이동미주');
  });
});

describe('차수 유지 (시세 구분 — 병합 금지)', () => {
  it('N차·N단지·후행 숫자는 그대로', () => {
    expect(normalizeMLTMName('장미1')).toBe('장미1');
    expect(normalizeMLTMName('장미2')).toBe('장미2');
    expect(normalizeMLTMName('우방')).toBe('우방');
    expect(normalizeMLTMName('우방1')).toBe('우방1');
    expect(normalizeMLTMName('잠실주공5단지')).toBe('잠실주공5단지');
    expect(normalizeMLTMName('금호자이1차')).toBe('금호자이1차');
  });
});

describe('공백·안전장치', () => {
  it('연속 공백 정리 + 트림', () => {
    expect(normalizeMLTMName('  래미안  퍼스티지 ')).toBe('래미안 퍼스티지');
  });

  it('fail-open: 정제가 전부 소거하면 원본 유지', () => {
    expect(normalizeMLTMName('(101동)')).toBe('(101동)');
    expect(normalizeMLTMName('101동')).toBe('101동');
  });

  it('비문자열·빈 입력 안전', () => {
    expect(normalizeMLTMName('')).toBe('');
    // @ts-expect-error 런타임 방어 확인
    expect(normalizeMLTMName(undefined)).toBe('');
  });

  it('정제 불필요한 정상 이름은 그대로 (멱등)', () => {
    const names = ['래미안원베일리', '헬리오시티', '올림픽파크포레온', 'e편한세상'];
    for (const n of names) {
      expect(normalizeMLTMName(n)).toBe(n);
      expect(normalizeMLTMName(normalizeMLTMName(n))).toBe(n);
    }
  });
});
