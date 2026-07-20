CREATE TABLE "pickup_locations" (
	"location_id" varchar(20) PRIMARY KEY NOT NULL,
	"extra_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" "currency" NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pickup_locations" ADD CONSTRAINT "pickup_locations_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE cascade ON UPDATE no action;