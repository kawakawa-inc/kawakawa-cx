-- Deduplicate existing role_permissions rows before adding the unique
-- constraint below. Prior seeding used onConflictDoNothing() with no unique
-- constraint to conflict against, so reruns silently appended duplicate
-- (role_id, permission_id) grants over time. Keep the oldest row per pair.
DELETE FROM "role_permissions" a USING "role_permissions" b
	WHERE a.id > b.id
		AND a.role_id = b.role_id
		AND a.permission_id = b.permission_id;
--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_permission_idx" ON "role_permissions" USING btree ("role_id","permission_id");
