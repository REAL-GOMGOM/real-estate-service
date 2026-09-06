import { expect, it } from 'vitest';
import { isPublicBlogEnabled } from '../public-features';

it('public columns are paused by default without relying on runtime environment values', () => {
  expect(isPublicBlogEnabled()).toBe(false);
});
