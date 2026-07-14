import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
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

/**
 * 일별 공개분 집계 — 사이클 AA (봇 공개분 연동)
 *
 * 아침 봇이 MOLIT diff 로 산출한 "오늘 공개(신고 등록)된" 거래를
 * 시도별로 push. 사이트 summary 는 이 값이 있으면 "오늘 공개 N건"
 * 지표로 표시하고, 없으면 월 누계 실집계로 폴백한다.
 */
export const dailyStats = pgTable('daily_stats', {
  // 공개일 (YYYY-MM-DD) — 하루 1행, 재전송 시 upsert
  date: text('date').primaryKey(),
  // 시도별 집계: [{ label, count, newHighs }]
  regions: jsonb('regions')
    .$type<{ label: string; count: number; newHighs: number }[]>()
    .notNull(),
  totalCount: integer('total_count').notNull(),
  totalNewHighs: integer('total_new_highs').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type DailyStats = typeof dailyStats.$inferSelect;

/**
 * 단지·면적별 역대 전고점 — 사이클 FF.
 *
 * 시드(2019.01~ 장기 MOLIT 집계, scripts/seed-apt-highs.ts) + 봇 일일
 * 신고가 push(/api/machine/apt-highs)로 유지. 더 높은 가격일 때만 갱신.
 * 단지 페이지 회복률이 이 값을 우선 사용하고, 없으면 36개월 폴백.
 */
export const aptHighs = pgTable('apt_highs', {
  id: text('id').primaryKey(),              // `${district}|${aptName}|${area}` (조회는 인덱스로)
  district: text('district').notNull(),     // 사이트 표기 시군구 (예: '강남구')
  aptName: text('apt_name').notNull(),      // MOLIT aptNm 원문
  area: integer('area').notNull(),          // 전용면적 반올림 ㎡
  price: integer('price').notNull(),        // 최고가 (만원)
  dealDate: text('deal_date').notNull(),    // 최고가 계약일 (YYYY-MM-DD)
  source: text('source').notNull(),         // 'seed' | 'bot'
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  districtNameIdx: index('apt_highs_district_name_idx').on(table.district, table.aptName),
}));

export type AptHigh = typeof aptHighs.$inferSelect;

/**
 * 단지 입지 점수 — 사이클 MM (analysis 스코어링 모델 산출물).
 *
 * scripts/import-apt-scores.ts 가 analysis/ CSV 3종을 반영.
 * 점수: 1.0(극상급) ~ 5.0(하급). K-apt 실측(용적률·주차)은 nullable.
 */
export const aptScores = pgTable('apt_scores', {
  id: text('id').primaryKey(),                    // SEED 단지명 (통칭)
  masterId: text('master_id'),                    // apartments 매칭 성공 시 PK
  district: text('district').notNull(),           // 자치구 표기 (analysis 기준)
  score: real('score').notNull(),                 // 단지입지점수
  regionScore: real('region_score').notNull(),    // 지역점수
  isRegionTop: boolean('is_region_top').notNull().default(false), // 지역 대장
  confidence: text('confidence').notNull(),       // H | M | L
  stationM: integer('station_m'),                 // 역세권 거리(m)
  elemSchool: boolean('elem_school'),             // 초품아
  brandScore: integer('brand_score'),             // 브랜드 (1~10)
  far: real('far'),                               // 용적률(%) — K-apt 실측
  farLimit: real('far_limit'),                    // 허용용적률(%)
  parkingPerHh: real('parking_per_hh'),           // 세대당 주차
  buildYear: integer('build_year'),               // 준공연도 (API 실측)
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  masterIdIdx: index('apt_scores_master_id_idx').on(table.masterId),
}));

export type AptScore = typeof aptScores.$inferSelect;

/**
 * 실거래 매매 원장 — Phase 2 (자체 DB 적재, 2026-07-14).
 *
 * 배경: /api/transactions 는 국토부 실시간 프록시라 첫 조회가 수 초.
 * 전국 실거래를 여기에 적재하고 조회를 DB 우선으로 전환한다
 * (프리워밍 크론 Phase 1의 근본 해법).
 *
 * 식별: 국토부는 안정적 거래 ID를 제공하지 않으므로, 물리적 거래를
 * 식별하는 자연 복합키를 정규화·조인한 dedupeKey 를 PK 로 쓴다
 * (aptHighs.id 파이프조인 관례 확장). 같은 거래의 재적재·해제 통보는
 * 같은 dedupeKey 로 매핑되어 신규 행이 아니라 기존 행을 갱신한다.
 * 키 생성 규칙은 lib/tx-dedupe-key.ts 단일 지점.
 */
export const transactions = pgTable('transactions', {
  dedupeKey: text('dedupe_key').primaryKey(),

  // ── 위치 ──
  lawdCd:  text('lawd_cd').notNull(),   // 5자리 지역코드 (조회 LAWD_CD = MOLIT sggCd)
  sigungu: text('sigungu').notNull(),   // 사이트 표기 시군구 (예 '강남구')
  umdNm:   text('umd_nm').notNull(),    // 법정동명 (MOLIT umdNm)
  jibun:   text('jibun'),               // 지번 (MOLIT jibun, nullable 방어)

  // ── 단지·물건 ──
  aptName:     text('apt_name').notNull(),      // MOLIT aptNm 원문
  aptNameNorm: text('apt_name_norm').notNull(), // normalizeMLTMName 결과 (검색·매칭·키)
  masterId:    text('master_id'),               // apartments PK (적재 시 null, 조회 시 조인)
  areaM2:      real('area_m2').notNull(),        // 전용면적 원값 ㎡ (반올림 X — 키 충돌 방지)
  floor:       integer('floor'),                 // 층 (nullable 방어)
  buildYear:   integer('build_year'),            // 건축년도

  // ── 거래 ──
  dealDate:   text('deal_date').notNull(),                 // 계약일 YYYY-MM-DD
  dealAmount: integer('deal_amount').notNull(),            // 거래금액 (만원)
  dealType:   text('deal_type').notNull().default('buy'),  // 'buy' (전월세·분양권은 후속 확장)
  dealingGbn: text('dealing_gbn'),                         // 거래유형 중개/직거래 (nullable)
  rgstDate:   text('rgst_date'),                           // 등기일자 (nullable, 늦게 확정)

  // ── 취소(해제) — 결정: 별도 표시 ──
  isCanceled:   boolean('is_canceled').notNull().default(false), // MOLIT cdealType='O'
  canceledDate: text('canceled_date'),                           // 해제사유발생일 (MOLIT cdealDay 원문)

  // ── 메타 ──
  source:    text('source').notNull().default('molit'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  lawdDateIdx: index('tx_lawd_date_idx').on(table.lawdCd, table.dealDate), // 지역+최근순 (주 조회)
  aptNormIdx:  index('tx_apt_norm_idx').on(table.aptNameNorm),             // 단지명 검색
  masterIdIdx: index('tx_master_id_idx').on(table.masterId),              // 마스터 단지 조인
}));

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
