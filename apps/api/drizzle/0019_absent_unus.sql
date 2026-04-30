CREATE TABLE "user_visited_views" (
	"user_id" integer NOT NULL,
	"view_id" integer NOT NULL,
	"last_visited_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_visited_views_user_id_view_id_pk" PRIMARY KEY("user_id","view_id")
);
--> statement-breakpoint
CREATE TABLE "view_owners" (
	"view_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "view_owners_view_id_user_id_pk" PRIMARY KEY("view_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "corp_overview_views" DROP CONSTRAINT "corp_overview_views_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "corp_overview_views_user_idx";--> statement-breakpoint
ALTER TABLE "corp_overview_views" ADD COLUMN "materials_table_tickers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "corp_overview_views" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_visited_views" ADD CONSTRAINT "user_visited_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_visited_views" ADD CONSTRAINT "user_visited_views_view_id_corp_overview_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."corp_overview_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_owners" ADD CONSTRAINT "view_owners_view_id_corp_overview_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."corp_overview_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_owners" ADD CONSTRAINT "view_owners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_visited_views_user_idx" ON "user_visited_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "view_owners_user_idx" ON "view_owners" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corp_overview_views_deleted_at_idx" ON "corp_overview_views" USING btree ("deleted_at");--> statement-breakpoint
-- Backfill: every existing view becomes a single-owner row in view_owners
-- before the legacy user_id column is dropped. Idempotent against re-runs via
-- the (view_id, user_id) primary key — ON CONFLICT DO NOTHING covers reapply
-- against a partially-migrated DB.
INSERT INTO "view_owners" ("view_id", "user_id")
SELECT "id", "user_id" FROM "corp_overview_views"
ON CONFLICT ("view_id", "user_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "corp_overview_views" DROP COLUMN "user_id";