import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const homeSource = readFileSync(resolve(process.cwd(), 'app/page.tsx'), 'utf8');

describe('home entry layout', () => {
  it('보존하기로 한 메인 문구를 그대로 유지한다', () => {
    expect(homeSource).toContain('부동산의 모든 답을, 한 곳에 압축하다');
  });

  it('저장·최근 단지 블록을 검색 직후, 퀵 액션과 제보·거래 카드 전에 한 번 배치한다', () => {
    const search = homeSource.indexOf('<HomeApartmentSearch />');
    const saved = homeSource.indexOf('<SavedApartmentsCard />');
    expect(saved).toBeGreaterThan(search);
    expect(saved).toBeLessThan(homeSource.indexOf('{SHORTCUTS.map'));
    expect(saved).toBeLessThan(homeSource.indexOf('<FieldReportsHome />'));
    expect(saved).toBeLessThan(homeSource.indexOf('<RecentDealsCard />'));
    expect(homeSource.match(/<SavedApartmentsCard\s*\/>/g)).toHaveLength(1);
  });
});
