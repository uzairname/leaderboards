ALTER TABLE "Guilds" RENAME COLUMN "match_results_channel_id" TO "matches_channel_id";--> statement-breakpoint
ALTER TABLE "ActiveMatches" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ActiveMatches" ALTER COLUMN "status" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ActiveMatches" ALTER COLUMN "team_votes" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Matches" ALTER COLUMN "time_started" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "Matches" ALTER COLUMN "time_started" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "ActiveMatches" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "GuildRankings" DROP COLUMN IF EXISTS "ongoing_matches_channel_id";