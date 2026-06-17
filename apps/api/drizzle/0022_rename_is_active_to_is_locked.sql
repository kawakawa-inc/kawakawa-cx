ALTER TABLE "users" RENAME COLUMN "is_active" TO "is_locked";--> statement-breakpoint
UPDATE "users" SET "is_locked" = NOT "is_locked";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_locked" SET DEFAULT false;