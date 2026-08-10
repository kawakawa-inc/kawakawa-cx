ALTER TABLE "sync_jobs" ADD COLUMN "error_code" text;--> statement-breakpoint
CREATE INDEX "sync_jobs_user_recent_idx" ON "sync_jobs" USING btree ("user_id","job_type","finished_at");