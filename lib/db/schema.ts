import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  uniqueIndex,
  jsonb,
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

/**
 * 단지 마스터 (사이클 H Phase 2.1)
 *
 * K-apt 공동주택 단지 + 네이버 검색 API + 카카오 지도 API로 적재 예정.
 * Phase 2.2에서 마이그레이션 적용 + 데이터 적재.
 *
 * 검색 흐름:
 *   1. 사용자 단지명 입력 → name·aliases (jsonb GIN) 검색
 *   2. lawd_cd로 MLTM 실거래 API 호출
 *   3. 좌표(lat/lng)로 지도 표시
 */
export const apartments = pgTable('apartments', {
  // 식별자 (예: K-apt kapt_code 또는 자체 생성 슬러그)
  id: text('id').primaryKey(),

  // 단지명
  name: text('name').notNull(),                              // 등록명 (MLTM 실거래의 aptNm 매칭)
  aliases: jsonb('aliases').$type<string[]>().default(sql`'[]'::jsonb`).notNull(), // 통칭·마케팅명 배열

  // 위치
  sido: text('sido').notNull(),                              // 시도 (예: '서울특별시')
  sigungu: text('sigungu').notNull(),                        // 시군구 (예: '강남구')
  dong: text('dong'),                                        // 읍면동
  roadAddress: text('road_address'),                         // 도로명주소
  jibunAddress: text('jibun_address'),                       // 지번주소
  lawdCd: text('lawd_cd').notNull(),                         // 법정동 5자리 (실거래 API 키)

  // 단지 정보
  kaptCode: text('kapt_code'),                               // K-apt 단지 식별자
  totalHouseholds: integer('total_households'),              // 세대수
  totalDongs: integer('total_dongs'),                        // 동수

  // 좌표 (PostGIS 미사용 — text 저장, 클라이언트에서 parseFloat)
  lat: text('lat'),                                          // 위도
  lng: text('lng'),                                          // 경도

  // 메타
  source: text('source').notNull(),                          // 'kapt' | 'naver' | 'manual'
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  nameIdx:    index('apartments_name_idx').on(table.name),
  lawdCdIdx:  index('apartments_lawd_cd_idx').on(table.lawdCd),
  sigunguIdx: index('apartments_sigungu_idx').on(table.sigungu),
}));

export type Apartment = typeof apartments.$inferSelect;
export type NewApartment = typeof apartments.$inferInsert;
