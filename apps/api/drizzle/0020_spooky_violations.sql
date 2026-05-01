ALTER TYPE "public"."sync_job_type" ADD VALUE 'user-ships';--> statement-breakpoint
CREATE TABLE "fio_user_ship_flights" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fio_flight_id" varchar(64) NOT NULL,
	"fio_ship_id" varchar(64) NOT NULL,
	"origin_display" text,
	"destination_display" text,
	"origin_natural_id" varchar(20),
	"destination_natural_id" varchar(20),
	"departure_at" timestamp,
	"arrival_at" timestamp,
	"current_segment_index" integer,
	"stl_distance" numeric(18, 4),
	"ftl_distance" numeric(18, 4),
	"is_aborted" boolean DEFAULT false NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_user_ship_repair_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"ship_id" integer NOT NULL,
	"material_ticker" varchar(10) NOT NULL,
	"amount" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_user_ships" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"fio_ship_id" varchar(64) NOT NULL,
	"registration" varchar(20) NOT NULL,
	"name" varchar(64) NOT NULL,
	"blueprint_natural_id" varchar(32),
	"commissioning_at" timestamp,
	"flight_id" varchar(64),
	"volume_m3" numeric(14, 4) DEFAULT '0' NOT NULL,
	"mass" numeric(14, 4) DEFAULT '0' NOT NULL,
	"operating_empty_mass" numeric(14, 4) DEFAULT '0' NOT NULL,
	"acceleration" numeric(14, 4),
	"thrust" numeric(14, 4),
	"reactor_power" numeric(14, 4),
	"emitter_power" numeric(14, 4),
	"stl_fuel_flow_rate" numeric(14, 6),
	"condition" numeric(6, 5),
	"last_repair_at" timestamp,
	"location_natural_id" varchar(20),
	"location_system_natural_id" varchar(20),
	"store_id" varchar(64),
	"stl_fuel_store_id" varchar(64),
	"ftl_fuel_store_id" varchar(64),
	"stl_fuel_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_weight_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_volume_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_weight_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_volume_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logistics_flows" ADD COLUMN "transit_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ship_flights" ADD CONSTRAINT "fio_user_ship_flights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_ship_repair_materials" ADD CONSTRAINT "fio_user_ship_repair_materials_ship_id_fio_user_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."fio_user_ships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD CONSTRAINT "fio_user_ships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fio_user_ship_flights_user_idx" ON "fio_user_ship_flights" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fio_user_ship_flights_user_flight_idx" ON "fio_user_ship_flights" USING btree ("user_id","fio_flight_id");--> statement-breakpoint
CREATE INDEX "fio_user_ship_repair_materials_ship_idx" ON "fio_user_ship_repair_materials" USING btree ("ship_id");--> statement-breakpoint
CREATE INDEX "fio_user_ships_user_idx" ON "fio_user_ships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fio_user_ships_user_ship_idx" ON "fio_user_ships" USING btree ("user_id","fio_ship_id");