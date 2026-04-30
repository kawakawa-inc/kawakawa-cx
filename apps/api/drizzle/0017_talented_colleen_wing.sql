-- Original drizzle-generated FK name was 64 chars and got silently truncated
-- to 63 by Postgres; we store the truncated form here explicitly so the DROP
-- matches whatever's actually in pg_constraint, regardless of whether the
-- server retruncates on lookup. IF EXISTS keeps the migration idempotent.
ALTER TABLE "price_list_versions" DROP CONSTRAINT IF EXISTS "price_list_versions_default_location_id_fio_locations_natural_i";
--> statement-breakpoint
ALTER TABLE "price_list_versions" ADD CONSTRAINT "price_list_versions_default_location_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;