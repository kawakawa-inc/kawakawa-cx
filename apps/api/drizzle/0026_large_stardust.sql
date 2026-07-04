CREATE TYPE "public"."recipe_type" AS ENUM('ship', 'building');--> statement-breakpoint
CREATE TABLE "recipe_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"commodity_ticker" varchar(10) NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "recipe_type" DEFAULT 'ship' NOT NULL,
	"sale_price" numeric(12, 2),
	"currency" "currency",
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_inputs" ADD CONSTRAINT "recipe_inputs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_inputs" ADD CONSTRAINT "recipe_inputs_commodity_ticker_fio_commodities_ticker_fk" FOREIGN KEY ("commodity_ticker") REFERENCES "public"."fio_commodities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_inputs_recipe_idx" ON "recipe_inputs" USING btree ("recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_inputs_recipe_commodity_idx" ON "recipe_inputs" USING btree ("recipe_id","commodity_ticker");--> statement-breakpoint
CREATE INDEX "recipes_name_idx" ON "recipes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "recipes_type_idx" ON "recipes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "recipes_active_idx" ON "recipes" USING btree ("is_active");