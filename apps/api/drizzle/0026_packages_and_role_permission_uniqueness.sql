CREATE TYPE "public"."package_pricing_mode" AS ENUM('fixed', 'margin');--> statement-breakpoint
CREATE TYPE "public"."package_type" AS ENUM('ship', 'building');--> statement-breakpoint
CREATE TABLE "package_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"package_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "package_type" DEFAULT 'ship' NOT NULL,
	"sale_price" numeric(12, 2),
	"currency" "currency",
	"pricing_mode" "package_pricing_mode" DEFAULT 'fixed' NOT NULL,
	"margin_multiplier" numeric(6, 4),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "package_inputs" ADD CONSTRAINT "package_inputs_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_inputs" ADD CONSTRAINT "package_inputs_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_inputs_package_idx" ON "package_inputs" USING btree ("package_id");--> statement-breakpoint
CREATE UNIQUE INDEX "package_inputs_package_commodity_idx" ON "package_inputs" USING btree ("package_id","commodity_ticker");--> statement-breakpoint
CREATE INDEX "packages_name_idx" ON "packages" USING btree ("name");--> statement-breakpoint
CREATE INDEX "packages_type_idx" ON "packages" USING btree ("type");--> statement-breakpoint
CREATE INDEX "packages_active_idx" ON "packages" USING btree ("is_active");--> statement-breakpoint
-- Deduplicate existing role_permissions rows before adding the unique
-- constraint below. Prior seeding used onConflictDoNothing() with no unique
-- constraint to conflict against, so reruns silently appended duplicate
-- (role_id, permission_id) grants over time. Keep the oldest row per pair.
DELETE FROM "role_permissions" a USING "role_permissions" b
	WHERE a.id > b.id
		AND a.role_id = b.role_id
		AND a.permission_id = b.permission_id;--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_permission_idx" ON "role_permissions" USING btree ("role_id","permission_id");