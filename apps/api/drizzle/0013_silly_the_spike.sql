CREATE TABLE "price_list_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_code" varchar(20) NOT NULL,
	"version" integer NOT NULL,
	"label" varchar(100),
	"description" text,
	"default_location_id" varchar(20) NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"promoted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "price_lists" DROP CONSTRAINT "price_lists_default_location_id_fio_locations_natural_id_fk";
--> statement-breakpoint
DROP INDEX "import_configs_price_list_idx";--> statement-breakpoint
DROP INDEX "prices_price_list_commodity_location_idx";--> statement-breakpoint
DROP INDEX "prices_price_list_idx";--> statement-breakpoint
ALTER TABLE "import_configs" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "current_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_list_versions" ADD CONSTRAINT "price_list_versions_price_list_code_price_lists_code_fk" FOREIGN KEY ("price_list_code") REFERENCES "public"."price_lists"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_versions" ADD CONSTRAINT "price_list_versions_default_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_versions" ADD CONSTRAINT "price_list_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_versions_code_version_idx" ON "price_list_versions" USING btree ("price_list_code","version");--> statement-breakpoint
CREATE INDEX "price_list_versions_price_list_idx" ON "price_list_versions" USING btree ("price_list_code");--> statement-breakpoint
CREATE INDEX "import_configs_price_list_version_idx" ON "import_configs" USING btree ("price_list_code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_price_list_version_commodity_location_idx" ON "prices" USING btree ("price_list_code","version","commodity_ticker","location_id");--> statement-breakpoint
CREATE INDEX "prices_price_list_version_idx" ON "prices" USING btree ("price_list_code","version");--> statement-breakpoint
-- Backfill: every existing price list gets a v=1 metadata row carrying its default_location_id.
-- Must run before dropping price_lists.default_location_id below.
INSERT INTO "price_list_versions" ("price_list_code", "version", "label", "default_location_id", "created_at", "promoted_at")
SELECT "code", 1, 'Initial version', "default_location_id", now(), now()
FROM "price_lists";--> statement-breakpoint
ALTER TABLE "price_lists" DROP COLUMN "default_location_id";