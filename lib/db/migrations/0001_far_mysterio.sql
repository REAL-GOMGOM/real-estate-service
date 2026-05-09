CREATE TABLE "apartments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sido" text NOT NULL,
	"sigungu" text NOT NULL,
	"dong" text,
	"road_address" text,
	"jibun_address" text,
	"lawd_cd" text NOT NULL,
	"kapt_code" text,
	"total_households" integer,
	"total_dongs" integer,
	"lat" text,
	"lng" text,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "apartments_name_idx" ON "apartments" USING btree ("name");--> statement-breakpoint
CREATE INDEX "apartments_lawd_cd_idx" ON "apartments" USING btree ("lawd_cd");--> statement-breakpoint
CREATE INDEX "apartments_sigungu_idx" ON "apartments" USING btree ("sigungu");