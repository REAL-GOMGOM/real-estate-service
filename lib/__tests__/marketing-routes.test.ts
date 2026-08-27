import { describe, expect, it } from 'vitest';
import {
  shouldLoadAdSense,
  shouldShowFooterCoupang,
  shouldShowTelegramFab,
} from '../marketing-routes';

describe('marketing route policy', () => {
  it('인라인 쿠팡 광고가 있는 화면에서는 푸터 광고를 숨긴다', () => {
    expect(shouldShowFooterCoupang('/schools')).toBe(false);
    expect(shouldShowFooterCoupang('/transactions')).toBe(false);
    expect(shouldShowFooterCoupang('/blog/seoul-apartment')).toBe(false);
    expect(shouldShowFooterCoupang('/apt/A100')).toBe(false);
    expect(shouldShowFooterCoupang('/loan')).toBe(false);
    expect(shouldShowFooterCoupang('/privacy')).toBe(false);
    expect(shouldShowFooterCoupang('/admin/posts')).toBe(false);
    expect(shouldShowFooterCoupang('/preview/draft')).toBe(false);
    expect(shouldShowFooterCoupang('/blog')).toBe(true);
    expect(shouldShowFooterCoupang('/blog/category/market')).toBe(true);
    expect(shouldShowFooterCoupang('/region/seoul')).toBe(true);
  });

  it('텔레그램 중복·법적·관리자·입력 집중 경로에서는 FAB를 숨긴다', () => {
    for (const path of [
      '/',
      '/telegram',
      '/privacy',
      '/admin/posts',
      '/loan',
      '/location-map',
      '/transactions',
      '/subscription',
      '/highlights',
      '/apt/123',
      '/region/seoul',
    ]) {
      expect(shouldShowTelegramFab(path), path).toBe(false);
    }

    expect(shouldShowTelegramFab('/blog')).toBe(true);
    expect(shouldShowTelegramFab('/news')).toBe(true);
    expect(shouldShowTelegramFab('/region')).toBe(true);
  });

  it('AdSense는 슬롯이 있는 지역 상세에서만 로드한다', () => {
    expect(shouldLoadAdSense('/region/seoul')).toBe(true);
    expect(shouldLoadAdSense('/region/seoul/')).toBe(true);
    expect(shouldLoadAdSense('/region')).toBe(false);
    expect(shouldLoadAdSense('/blog/seoul')).toBe(false);
  });
});
