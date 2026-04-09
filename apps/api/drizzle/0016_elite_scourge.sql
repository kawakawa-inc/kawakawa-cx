CREATE TYPE "public"."supply_chain_demand_source" AS ENUM('consumables', 'inputs', 'repair', 'government', 'other');--> statement-breakpoint
CREATE TYPE "public"."supply_chain_mode" AS ENUM('demand', 'reserve');--> statement-breakpoint
CREATE TABLE "supply_chain_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"source_location_id" varchar(20) NOT NULL,
	"source_storage_types" jsonb NOT NULL,
	"destination_planet_id" varchar(20) NOT NULL,
	"destination_storage_types" jsonb NOT NULL,
	"mode" "supply_chain_mode" NOT NULL,
	"demand_source" "supply_chain_demand_source",
	"demand" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE "buy_order_planets" CASCADE;--> statement-breakpoint
DROP TABLE "sell_order_planets" CASCADE;--> statement-breakpoint
ALTER TABLE "fio_planet_buildings" ADD COLUMN "construction_costs" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_planet_production" ADD COLUMN "capacity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supply_chain_lines" ADD CONSTRAINT "supply_chain_lines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lines" ADD CONSTRAINT "scl_commodity_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_chain_lines" ADD CONSTRAINT "scl_source_location_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supply_chain_lines_user_idx" ON "supply_chain_lines" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lines_source_idx" ON "supply_chain_lines" USING btree ("user_id","source_location_id");--> statement-breakpoint
CREATE INDEX "supply_chain_lines_dest_idx" ON "supply_chain_lines" USING btree ("user_id","destination_planet_id");