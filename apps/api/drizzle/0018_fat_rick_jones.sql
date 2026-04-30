-- Rename the existing 'link' enum value in-place. Postgres preserves all rows
-- and column defaults; no recast or recreate needed.
-- Drizzle's auto-generated diff would have dropped & recreated the enum, which
-- fails on any row currently holding 'link'. RENAME VALUE is atomic and
-- non-destructive.
ALTER TYPE "public"."filter_privacy" RENAME VALUE 'link' TO 'unlisted';
