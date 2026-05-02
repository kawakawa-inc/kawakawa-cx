DROP INDEX "buy_orders_user_commodity_location_type_currency_idx";--> statement-breakpoint
DROP INDEX "sell_orders_user_commodity_location_type_currency_idx";--> statement-breakpoint
ALTER TABLE "buy_orders" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "sell_orders" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "buy_orders_deleted_at_idx" ON "buy_orders" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "sell_orders_deleted_at_idx" ON "sell_orders" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "buy_orders_user_commodity_location_type_currency_idx" ON "buy_orders" USING btree ("user_id","commodity_ticker","location_id","order_type","currency") WHERE "buy_orders"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sell_orders_user_commodity_location_type_currency_idx" ON "sell_orders" USING btree ("user_id","commodity_ticker","location_id","order_type","currency") WHERE "sell_orders"."deleted_at" IS NULL;