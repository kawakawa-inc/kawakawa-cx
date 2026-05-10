CREATE TYPE "public"."logistics_shipment_status" AS ENUM('planned', 'dispatched', 'delivered', 'cancelled');--> statement-breakpoint
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
	"name" varchar(64),
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
	"fio_reported_at" timestamp,
	"store_id" varchar(64),
	"stl_fuel_store_id" varchar(64),
	"ftl_fuel_store_id" varchar(64),
	"cargo_weight_load" numeric(14, 4) DEFAULT '0' NOT NULL,
	"cargo_weight_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"cargo_volume_load" numeric(14, 4) DEFAULT '0' NOT NULL,
	"cargo_volume_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_max_units" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_weight_load" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_weight_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_volume_load" numeric(14, 4) DEFAULT '0' NOT NULL,
	"stl_fuel_volume_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_max_units" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_weight_load" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_weight_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_volume_load" numeric(14, 4) DEFAULT '0' NOT NULL,
	"ftl_fuel_volume_capacity" numeric(14, 4) DEFAULT '0' NOT NULL,
	"last_synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logistics_self_supplied" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipment_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" integer NOT NULL,
	"flow_id" integer,
	"commodity_ticker" varchar(10) NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"trip_id" integer,
	"origin_location_id" varchar(20) NOT NULL,
	"dest_location_id" varchar(20) NOT NULL,
	"origin_stop_id" integer,
	"dest_stop_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"planned_arrive_at" timestamp NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ship_db_id" integer,
	"status" "logistics_shipment_status" DEFAULT 'planned' NOT NULL,
	"actual_dispatch_at" timestamp,
	"actual_arrival_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "logistics_flows" ADD COLUMN "transit_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "logistics_flows" ADD COLUMN "cadence_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ship_flights" ADD CONSTRAINT "fio_user_ship_flights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_ship_repair_materials" ADD CONSTRAINT "fio_user_ship_repair_materials_ship_id_fio_user_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."fio_user_ships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD CONSTRAINT "fio_user_ships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_self_supplied" ADD CONSTRAINT "logistics_self_supplied_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_self_supplied" ADD CONSTRAINT "logistics_self_supplied_location_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logistics_self_supplied" ADD CONSTRAINT "logistics_self_supplied_commodity_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_commodity_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_flow_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."logistics_flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_trip_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_origin_location_fk" FOREIGN KEY ("origin_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_dest_location_fk" FOREIGN KEY ("dest_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_origin_stop_fk" FOREIGN KEY ("origin_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_dest_stop_fk" FOREIGN KEY ("dest_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_location_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_ship_fk" FOREIGN KEY ("ship_db_id") REFERENCES "public"."fio_user_ships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fio_user_ship_flights_user_idx" ON "fio_user_ship_flights" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fio_user_ship_flights_user_flight_idx" ON "fio_user_ship_flights" USING btree ("user_id","fio_flight_id");--> statement-breakpoint
CREATE INDEX "fio_user_ship_repair_materials_ship_idx" ON "fio_user_ship_repair_materials" USING btree ("ship_id");--> statement-breakpoint
CREATE INDEX "fio_user_ships_user_idx" ON "fio_user_ships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fio_user_ships_user_ship_idx" ON "fio_user_ships" USING btree ("user_id","fio_ship_id");--> statement-breakpoint
CREATE INDEX "logistics_self_supplied_user_idx" ON "logistics_self_supplied" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "logistics_self_supplied_user_loc_ticker_idx" ON "logistics_self_supplied" USING btree ("user_id","location_id","commodity_ticker");--> statement-breakpoint
CREATE INDEX "shipment_lines_shipment_idx" ON "shipment_lines" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_lines_flow_idx" ON "shipment_lines" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "shipments_user_idx" ON "shipments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shipments_trip_idx" ON "shipments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "shipments_queued_idx" ON "shipments" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "trip_stops_trip_idx" ON "trip_stops" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_stops_seq_uniq" ON "trip_stops" USING btree ("trip_id","sequence");--> statement-breakpoint
CREATE INDEX "trips_user_idx" ON "trips" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trips_status_idx" ON "trips" USING btree ("user_id","status");