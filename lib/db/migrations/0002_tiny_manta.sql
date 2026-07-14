CREATE TABLE "apt_highs" (
	"id" text PRIMARY KEY NOT NULL,
	"district" text NOT NULL,
	"apt_name" text NOT NULL,
	"area" integer NOT NULL,
	"price" integer NOT NULL,
	"deal_date" text NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apt_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"master_id" text,
	"district" text NOT NULL,
	"score" real NOT NULL,
	"region_score" real NOT NULL,
	"is_region_top" boolean DEFAULT false NOT NULL,
	"confidence" text NOT NULL,
	"station_m" integer,
	"elem_school" boolean,
	"brand_score" integer,
	"far" real,
	"far_limit" real,
	"parking_per_hh" real,
	"build_year" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"date" text PRIMARY KEY NOT NULL,
	"regions" jsonb NOT NULL,
	"total_count" integer NOT NULL,
	"total_new_highs" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"dedupe_key" text PRIMARY KEY NOT NULL,
	"lawd_cd" text NOT NULL,
	"sigungu" text NOT NULL,
	"umd_nm" text NOT NULL,
	"jibun" text,
	"apt_name" text NOT NULL,
	"apt_name_norm" text NOT NULL,
	"master_id" text,
	"area_m2" real NOT NULL,
	"floor" integer,
	"build_year" integer,
	"deal_date" text NOT NULL,
	"deal_amount" integer NOT NULL,
	"deal_type" text DEFAULT 'buy' NOT NULL,
	"dealing_gbn" text,
	"rgst_date" text,
	"is_canceled" boolean DEFAULT false NOT NULL,
	"canceled_date" text,
	"source" text DEFAULT 'molit' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "apt_highs_district_name_idx" ON "apt_highs" USING btree ("district","apt_name");--> statement-breakpoint
CREATE INDEX "apt_scores_master_id_idx" ON "apt_scores" USING btree ("master_id");--> statement-breakpoint
CREATE INDEX "tx_lawd_date_idx" ON "transactions" USING btree ("lawd_cd","deal_date");--> statement-breakpoint
CREATE INDEX "tx_apt_norm_idx" ON "transactions" USING btree ("apt_name_norm");--> statement-breakpoint
CREATE INDEX "tx_master_id_idx" ON "transactions" USING btree ("master_id");