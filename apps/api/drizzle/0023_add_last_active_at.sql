ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp;--> statement-breakpoint
WITH fio_activity AS (
  SELECT user_id, MAX(latest) AS latest_fio_at
  FROM (
    SELECT user_id, MAX(fio_uploaded_at) AS latest FROM fio_user_storage GROUP BY user_id
    UNION ALL
    SELECT user_id, MAX(fio_reported_at) AS latest FROM fio_user_ships GROUP BY user_id
  ) combined
  GROUP BY user_id
)
UPDATE users u
SET last_active_at = COALESCE(f.latest_fio_at, now())
FROM fio_activity f
WHERE u.id = f.user_id;--> statement-breakpoint
UPDATE users SET last_active_at = now() WHERE last_active_at IS NULL;