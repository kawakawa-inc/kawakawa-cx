CREATE TYPE "public"."logistics_shipment_status" AS ENUM('planned', 'dispatched', 'delivered', 'cancelled');--> statement-breakpoint
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
	"from_location_id" varchar(20) NOT NULL,
	"to_location_id" varchar(20) NOT NULL,
	"ship_db_id" integer,
	"planned_load_at" timestamp NOT NULL,
	"planned_arrival_at" timestamp NOT NULL,
	"status" "logistics_shipment_status" DEFAULT 'planned' NOT NULL,
	"actual_dispatch_at" timestamp,
	"actual_arrival_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_commodity_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_flow_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."logistics_flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_from_location_fk" FOREIGN KEY ("from_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_to_location_fk" FOREIGN KEY ("to_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_ship_fk" FOREIGN KEY ("ship_db_id") REFERENCES "public"."fio_user_ships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_lines_shipment_idx" ON "shipment_lines" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipment_lines_flow_idx" ON "shipment_lines" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "shipments_user_idx" ON "shipments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shipments_active_idx" ON "shipments" USING btree ("user_id","status","planned_arrival_at");