CREATE TYPE "public"."buy_order_source_mode" AS ENUM('manual', 'demand');--> statement-breakpoint
CREATE TYPE "public"."demand_rate" AS ENUM('total', 'daily');--> statement-breakpoint
CREATE TYPE "public"."demand_source" AS ENUM('burn', 'repair');--> statement-breakpoint
CREATE TYPE "public"."logistics_claim_category" AS ENUM('government', 'contract', 'reserve', 'other');--> statement-breakpoint
CREATE TYPE "public"."logistics_claim_source" AS ENUM('manual', 'auto');--> statement-breakpoint
CREATE TYPE "public"."logistics_flow_kind" AS ENUM('demand', 'surplus', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."reserve_source" AS ENUM('manual', 'demand');--> statement-breakpoint
CREATE TYPE "public"."sync_job_source" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_job_type" AS ENUM('user-inventory', 'user-planets-list', 'planet-detail', 'cache-recompute', 'commodities', 'locations', 'stations');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'sync_queued';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'sync_completed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'sync_failed';--> statement-breakpoint
CREATE TABLE "burn_repair_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"user_planet_id" integer NOT NULL,
	"planet_natural_id" varchar(20) NOT NULL,
	"planet_name" varchar(100) NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"burn_daily" numeric(12, 4) DEFAULT '0' NOT NULL,
	"inputs_daily" numeric(12, 4) DEFAULT '0' NOT NULL,
	"repair_total" numeric(12, 4) DEFAULT '0' NOT NULL,
	"production_daily" numeric(12, 4) DEFAULT '0' NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corp_overview_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"tickers" jsonb NOT NULL,
	"cards" jsonb NOT NULL,
	"privacy" "filter_privacy" DEFAULT 'private' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corp_snapshot_ticker_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_at" date NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"stock" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corp_snapshot_user_ticker" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_at" date NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"burn_daily" numeric(12, 4) NOT NULL,
	"inputs_daily" numeric(12, 4) NOT NULL,
	"production_daily" numeric(12, 4) NOT NULL,
	"repair_total" numeric(12, 4) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_planet_buildings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_planet_id" integer NOT NULL,
	"building_id" varchar(40) NOT NULL,
	"building_ticker" varchar(10) NOT NULL,
	"building_created" timestamp NOT NULL,
	"building_last_repair" timestamp,
	"condition" numeric(6, 4) NOT NULL,
	"repair_materials" jsonb NOT NULL,
	"reclaimable_materials" jsonb NOT NULL,
	"construction_costs" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_planet_production" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_planet_id" integer NOT NULL,
	"line_type" varchar(40) NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"condition" numeric(6, 4) NOT NULL,
	"efficiency" numeric(6, 4) NOT NULL,
	"orders" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_planet_workforce" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_planet_id" integer NOT NULL,
	"workforce_type" varchar(30) NOT NULL,
	"population" integer NOT NULL,
	"required" integer NOT NULL,
	"needs" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_user_planets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"planet_natural_id" varchar(20) NOT NULL,
	"planet_name" varchar(100) NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_demand_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"rate" "demand_rate" NOT NULL,
	"category" "logistics_claim_category" NOT NULL,
	"note" text,
	"source" "logistics_claim_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logistics_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"from_location_id" varchar(20) NOT NULL,
	"from_storage_types" jsonb NOT NULL,
	"to_location_id" varchar(20) NOT NULL,
	"to_storage_types" jsonb NOT NULL,
	"kind" "logistics_flow_kind" NOT NULL,
	"amount_override" integer,
	"rate" "demand_rate" DEFAULT 'daily' NOT NULL,
	"priority" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" "sync_job_type" NOT NULL,
	"user_id" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"source" "sync_job_source" DEFAULT 'system' NOT NULL,
	"status" "sync_job_status" DEFAULT 'pending' NOT NULL,
	"parent_job_id" integer,
	"notify_on_complete" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"enqueued_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "source_mode" "buy_order_source_mode" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "demand_source" "demand_source";--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "target_days" integer;--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "reserve_source" "reserve_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "reserve_demand_source" "demand_source";--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "reserve_target_days" integer;--> statement-breakpoint
ALTER TABLE "burn_repair_cache" ADD CONSTRAINT "burn_repair_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "burn_repair_cache" ADD CONSTRAINT "burn_repair_cache_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_overview_views" ADD CONSTRAINT "corp_overview_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corp_snapshot_user_ticker" ADD CONSTRAINT "corp_snapshot_user_ticker_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_planet_buildings" ADD CONSTRAINT "fio_planet_buildings_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_planet_production" ADD CONSTRAINT "fio_planet_production_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_planet_workforce" ADD CONSTRAINT "fio_planet_workforce_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_planets" ADD CONSTRAINT "fio_user_planets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_demand_claims" ADD CONSTRAINT "location_demand_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_demand_claims" ADD CONSTRAINT "ldc_commodity_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_demand_claims" ADD CONSTRAINT "ldc_location_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_flows" ADD CONSTRAINT "logistics_flows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_flows" ADD CONSTRAINT "logistics_flows_commodity_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_flows" ADD CONSTRAINT "logistics_flows_from_location_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_flows" ADD CONSTRAINT "logistics_flows_to_location_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_parent_job_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."sync_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "burn_repair_cache_user_planet_ticker_idx" ON "burn_repair_cache" USING btree ("user_id","planet_natural_id","commodity_ticker");--> statement-breakpoint
CREATE INDEX "burn_repair_cache_user_idx" ON "burn_repair_cache" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "burn_repair_cache_user_planet_idx" ON "burn_repair_cache" USING btree ("user_planet_id");--> statement-breakpoint
CREATE INDEX "corp_overview_views_user_idx" ON "corp_overview_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "corp_overview_views_privacy_idx" ON "corp_overview_views" USING btree ("privacy");--> statement-breakpoint
CREATE INDEX "corp_overview_views_pinned_idx" ON "corp_overview_views" USING btree ("is_pinned");--> statement-breakpoint
CREATE UNIQUE INDEX "corp_snapshot_ticker_stock_uniq" ON "corp_snapshot_ticker_stock" USING btree ("commodity_ticker","snapshot_at");--> statement-breakpoint
CREATE INDEX "corp_snapshot_ticker_stock_time_idx" ON "corp_snapshot_ticker_stock" USING btree ("snapshot_at");--> statement-breakpoint
CREATE UNIQUE INDEX "corp_snapshot_user_ticker_uniq" ON "corp_snapshot_user_ticker" USING btree ("user_id","commodity_ticker","snapshot_at");--> statement-breakpoint
CREATE INDEX "corp_snapshot_user_ticker_ticker_time_idx" ON "corp_snapshot_user_ticker" USING btree ("commodity_ticker","snapshot_at");--> statement-breakpoint
CREATE INDEX "corp_snapshot_user_ticker_time_idx" ON "corp_snapshot_user_ticker" USING btree ("snapshot_at");--> statement-breakpoint
CREATE INDEX "fio_planet_buildings_user_planet_idx" ON "fio_planet_buildings" USING btree ("user_planet_id");--> statement-breakpoint
CREATE INDEX "fio_planet_production_user_planet_idx" ON "fio_planet_production" USING btree ("user_planet_id");--> statement-breakpoint
CREATE INDEX "fio_planet_workforce_user_planet_idx" ON "fio_planet_workforce" USING btree ("user_planet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fio_user_planets_user_planet_idx" ON "fio_user_planets" USING btree ("user_id","planet_natural_id");--> statement-breakpoint
CREATE INDEX "location_demand_claims_user_idx" ON "location_demand_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_demand_claims_location_idx" ON "location_demand_claims" USING btree ("user_id","location_id");--> statement-breakpoint
CREATE INDEX "logistics_flows_user_idx" ON "logistics_flows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "logistics_flows_from_idx" ON "logistics_flows" USING btree ("user_id","from_location_id");--> statement-breakpoint
CREATE INDEX "logistics_flows_to_idx" ON "logistics_flows" USING btree ("user_id","to_location_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_pick_next_idx" ON "sync_jobs" USING btree ("status","priority","next_attempt_at");--> statement-breakpoint
CREATE INDEX "sync_jobs_user_status_idx" ON "sync_jobs" USING btree ("user_id","status","job_type");--> statement-breakpoint
CREATE INDEX "sync_jobs_parent_idx" ON "sync_jobs" USING btree ("parent_job_id");