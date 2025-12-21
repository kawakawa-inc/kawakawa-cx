CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'submitted', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"sell_order_id" integer,
	"buy_order_id" integer,
	"reservation_id" integer,
	"commodity_ticker" varchar(10) NOT NULL,
	"location_id" varchar(20) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"price_list_code" varchar(20),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"counterparty_user_id" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"name" varchar(100),
	"notes" text,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_sell_order_id_sell_orders_id_fk" FOREIGN KEY ("sell_order_id") REFERENCES "public"."sell_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_buy_order_id_buy_orders_id_fk" FOREIGN KEY ("buy_order_id") REFERENCES "public"."buy_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_reservation_id_order_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."order_reservations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_counterparty_user_id_users_id_fk" FOREIGN KEY ("counterparty_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_idx" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_sell_order_idx" ON "invoice_line_items" USING btree ("sell_order_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_buy_order_idx" ON "invoice_line_items" USING btree ("buy_order_id");--> statement-breakpoint
CREATE INDEX "invoice_line_items_reservation_idx" ON "invoice_line_items" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_counterparty_idx" ON "invoices" USING btree ("counterparty_user_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");