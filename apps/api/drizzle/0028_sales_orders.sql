CREATE TYPE "public"."sales_order_status" AS ENUM('open', 'claimed', 'fulfilled', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'sales_order_claimed' BEFORE 'user_needs_approval';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'sales_order_fulfilled' BEFORE 'user_needs_approval';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'sales_order_cancelled' BEFORE 'user_needs_approval';--> statement-breakpoint
CREATE TABLE "sales_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sales_order_id" integer NOT NULL,
	"package_id" integer,
	"package_name" varchar(100) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"claimed_by_user_id" integer,
	"status" "sales_order_status" DEFAULT 'open' NOT NULL,
	"customer_name" varchar(100),
	"notes" text,
	"price_list_code" varchar(20),
	"version" integer,
	"currency" "currency",
	"pickup_location_id" varchar(20),
	"pickup_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"packages_subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"claimed_at" timestamp,
	"fulfilled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_pickup_location_id_fio_locations_natural_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."fio_locations"("natural_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_order_items_sales_order_idx" ON "sales_order_items" USING btree ("sales_order_id");--> statement-breakpoint
CREATE INDEX "sales_orders_status_idx" ON "sales_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_orders_requested_by_idx" ON "sales_orders" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "sales_orders_claimed_by_idx" ON "sales_orders" USING btree ("claimed_by_user_id");