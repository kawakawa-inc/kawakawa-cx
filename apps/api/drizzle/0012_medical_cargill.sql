CREATE TYPE "public"."filter_privacy" AS ENUM('private', 'link', 'public');--> statement-breakpoint
CREATE TABLE "saved_market_filters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"filter_data" jsonb NOT NULL,
	"privacy" "filter_privacy" DEFAULT 'private' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_market_filters" ADD CONSTRAINT "saved_market_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_market_filters_user_idx" ON "saved_market_filters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_market_filters_privacy_idx" ON "saved_market_filters" USING btree ("privacy");--> statement-breakpoint
CREATE INDEX "saved_market_filters_pinned_idx" ON "saved_market_filters" USING btree ("is_pinned");