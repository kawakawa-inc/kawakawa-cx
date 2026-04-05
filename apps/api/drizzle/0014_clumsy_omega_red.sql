CREATE TYPE "public"."buy_order_source_mode" AS ENUM('manual', 'demand');--> statement-breakpoint
CREATE TYPE "public"."demand_source" AS ENUM('burn', 'repair');--> statement-breakpoint
CREATE TABLE "buy_order_planets" (
	"id" serial PRIMARY KEY NOT NULL,
	"buy_order_id" integer NOT NULL,
	"user_planet_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "source_mode" "buy_order_source_mode" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "demand_source" "demand_source";--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "target_days" integer;--> statement-breakpoint
ALTER TABLE "buy_order_planets" ADD CONSTRAINT "buy_order_planets_buy_order_id_buy_orders_id_fk" FOREIGN KEY ("buy_order_id") REFERENCES "public"."buy_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_order_planets" ADD CONSTRAINT "buy_order_planets_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "buy_order_planets_buy_order_idx" ON "buy_order_planets" USING btree ("buy_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "buy_order_planets_unique_idx" ON "buy_order_planets" USING btree ("buy_order_id","user_planet_id");