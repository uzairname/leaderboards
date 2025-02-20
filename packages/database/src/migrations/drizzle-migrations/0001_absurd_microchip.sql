ALTER TABLE "Players" ADD COLUMN "time_joined_queue" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_time_joined_queue_index" ON "Players" USING btree ("time_joined_queue");