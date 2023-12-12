ALTER TABLE "Matches" RENAME COLUMN "time_created" TO "time_started";--> statement-breakpoint
ALTER TABLE "Matches" ALTER COLUMN "time_started" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_ranking_id_index" ON "Matches" ("ranking_id");