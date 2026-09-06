// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberApartment, toggleFavoriteApartment } from '@/lib/apartment-retention';
import SavedApartmentsCard from '../SavedApartmentsCard';

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  host.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('SavedApartmentsCard', () => {
  it('새 사용자는 검색 근처에 빈 카드나 여백용 영역을 만들지 않는다', async () => {
    await act(async () => root!.render(<SavedApartmentsCard />));
    expect(host.innerHTML).toBe('');
  });

  it('관심 단지를 우선하고 최근 본 단지를 중복 없이 표시한다', async () => {
    const apartment = { id: 'A1', name: '관심 단지', district: '송파구', dong: '잠실동' };
    rememberApartment(apartment);
    rememberApartment({ ...apartment, id: 'A2', name: '최근 단지' });
    toggleFavoriteApartment(apartment);
    await act(async () => root!.render(<SavedApartmentsCard />));
    const links = [...host.querySelectorAll('a')];
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/apt/A1', '/apt/A2']);
    expect(host.textContent).toContain('내 단지 다시 보기');
    expect(host.textContent).toContain('이 기기에만 저장돼요');
  });
});
