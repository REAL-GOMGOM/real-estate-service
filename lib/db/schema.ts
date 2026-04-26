import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * 칼럼(블로그) 시스템 — 첫 스키마 (MVP 1A)
 *
 * 의도적으로 최소화:
 * - posts: 글 본문 + 메타데이터
 * - categories: 카테고리 (단일 분류)
 *
 * 다음 단계 (Phase 2~3)로 미룸:
 * - tags / post_tags
 * - post_views
 * - post_revisions
 * - users (단독 저자 + 환경변수 인증이라 불필요)
 * - status='scheduled' (예약 발행)
 */

// 글 발행 상태
export const postStatusEnum = pgEnum('post_status', ['draft', 'published']);

// 카테고리
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  // slug는 URL에 노출되므로 unique 보장
  slugIdx: uniqueIndex('categories_slug_idx').on(table.slug),
}));

// 글
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  excerpt: text('excerpt'),
  // MDX 본문 (마크다운 + JSX). next-mdx-remote가 런타임 컴파일.
  mdxContent: text('mdx_content').notNull(),
  coverImageUrl: text('cover_image_url'),
  // 카테고리 미지정 글 허용 (ON DELETE SET NULL)
  categoryId: uuid('category_id').references(() => categories.id, {
    onDelete: 'set null',
  }),
  status: postStatusEnum('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  viewCount: integer('view_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  slugIdx: uniqueIndex('posts_slug_idx').on(table.slug),
  // /blog 목록: 발행된 것만 시간순
  statusPublishedAtIdx: index('posts_status_published_at_idx').on(
    table.status,
    table.publishedAt,
  ),
  // 카테고리 페이지: 해당 카테고리의 발행글
  categoryStatusIdx: index('posts_category_status_idx').on(
    table.categoryId,
    table.status,
  ),
}));

// 타입 export (다른 코드에서 import해서 쓸 것)
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
