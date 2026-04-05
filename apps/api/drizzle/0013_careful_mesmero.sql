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
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fio_planet_production" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_planet_id" integer NOT NULL,
	"line_type" varchar(40) NOT NULL,
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
ALTER TABLE "fio_planet_buildings" ADD CONSTRAINT "fio_planet_buildings_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_planet_production" ADD CONSTRAINT "fio_planet_production_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_planet_workforce" ADD CONSTRAINT "fio_planet_workforce_user_planet_id_fio_user_planets_id_fk" FOREIGN KEY ("user_planet_id") REFERENCES "public"."fio_user_planets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fio_user_planets" ADD CONSTRAINT "fio_user_planets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fio_planet_buildings_user_planet_idx" ON "fio_planet_buildings" USING btree ("user_planet_id");--> statement-breakpoint
CREATE INDEX "fio_planet_production_user_planet_idx" ON "fio_planet_production" USING btree ("user_planet_id");--> statement-breakpoint
CREATE INDEX "fio_planet_workforce_user_planet_idx" ON "fio_planet_workforce" USING btree ("user_planet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fio_user_planets_user_planet_idx" ON "fio_user_planets" USING btree ("user_id","planet_natural_id");