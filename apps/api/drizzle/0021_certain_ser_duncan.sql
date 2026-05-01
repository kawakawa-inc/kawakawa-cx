ALTER TABLE "fio_user_ships" ADD COLUMN "fio_reported_at" timestamp;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "cargo_weight_load" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "cargo_weight_capacity" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "cargo_volume_load" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "cargo_volume_capacity" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "stl_fuel_max_units" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "stl_fuel_weight_load" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "stl_fuel_volume_load" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "ftl_fuel_max_units" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "ftl_fuel_weight_load" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "fio_user_ships" ADD COLUMN "ftl_fuel_volume_load" numeric(14, 4) DEFAULT '0' NOT NULL;