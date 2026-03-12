CREATE TYPE "public"."filter_privacy" AS ENUM('private', 'link', 'public');

CREATE TABLE "saved_market_filters" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(100) NOT NULL,
  "filter_data" jsonb NOT NULL,
  "privacy" "filter_privacy" NOT NULL DEFAULT 'private',
  "is_pinned" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "saved_market_filters_user_idx" ON "saved_market_filters" ("user_id");
CREATE INDEX "saved_market_filters_privacy_idx" ON "saved_market_filters" ("privacy");
CREATE INDEX "saved_market_filters_pinned_idx" ON "saved_market_filters" ("is_pinned");
