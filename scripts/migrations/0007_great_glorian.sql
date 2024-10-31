ALTER TABLE "MatchPlayers" ADD COLUMN "flags" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Players" ADD COLUMN "flags" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_time_started_index" ON "Matches" USING btree ("time_started");
