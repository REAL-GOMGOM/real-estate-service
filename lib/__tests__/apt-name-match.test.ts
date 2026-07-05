import { describe, it, expect } from 'vitest';
import { buildNameCandidates, aptNameMatches } from '@/lib/apt-name-match';

/** 사이클 DD — 단지 전용 페이지 단지명 매칭 규칙 */

describe('aptNameMatches', () => {
  it('등록명 원문 일치', () => {
    const c = buildNameCandidates({ name: '헬리오시티', aliases: [] });
    expect(aptNameMatches('헬리오시티', c)).toBe(true);
    expect(aptNameMatches('파크리오', c)).toBe(false);
  });

  it('별칭 일치', () => {
    const c = buildNameCandidates({ name: '송파헬리오시티', aliases: ['헬리오시티'] });
    expect(aptNameMatches('헬리오시티', c)).toBe(true);
  });

  it('MOLTM 동 표기·괄호는 정제명으로 매칭', () => {
    const c = buildNameCandidates({ name: '쌍용스위닷홈', aliases: [] });
    // 원천 데이터의 동 분산 표기 — normalizeMLTMName 경유 매칭
    expect(aptNameMatches('쌍용스위닷홈(201동)', c)).toBe(true);
    expect(aptNameMatches('쌍용스위닷홈101동', c)).toBe(true);
  });

  it('차수는 병합하지 않음 (다른 단지)', () => {
    const c = buildNameCandidates({ name: '래미안1차', aliases: [] });
    expect(aptNameMatches('래미안(1차)', c)).toBe(true);   // 언랩 부착 → 래미안1차
    expect(aptNameMatches('래미안2차', c)).toBe(false);
  });

  it('빈 문자열·공백 방어', () => {
    const c = buildNameCandidates({ name: '테스트단지', aliases: ['', '  '] });
    expect(aptNameMatches('', c)).toBe(false);
    expect(aptNameMatches('  ', c)).toBe(false);
    expect(c.has('')).toBe(false);
  });
});
