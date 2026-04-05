CREATE TYPE "public"."reserve_source" AS ENUM('manual', 'demand');--> statement-breakpoint
CREATE TABLE "sell_order_planets" (
	"id" serial PRIMARY KEY NOT NULL,
	"sell_order_id" integer NOT NULL,
	"user_planet_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "reserve_source" "reserve_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "reserve_demand_source" "demand_source";--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "reserve_target_days" integer;--> statement-breakpoint
ALTER TABLE "sell_order_planets" ADD CONSTRAINT "sell_order_planets_sell_order_id_sell_orders_id_fk" FOREIGN KEY ("sell_order_id") REFERENCES "public"."sell_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sell_order_planets" ADD CONSTRAINT "sell_order_planets_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sell_order_planets_sell_order_idx" ON "sell_order_planets" USING btree ("sell_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sell_order_planets_unique_idx" ON "sell_order_planets" USING btree ("sell_order_id","user_planet_id");