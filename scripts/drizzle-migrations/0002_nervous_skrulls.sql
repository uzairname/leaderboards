DROP TABLE "ActiveMatches";--> statement-breakpoint
ALTER TABLE "MatchPlayers" ALTER COLUMN "team_num" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "MatchPlayers" ALTER COLUMN "rating_before" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "MatchPlayers" ALTER COLUMN "rd_before" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Matches" ALTER COLUMN "time_started" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Matches" ALTER COLUMN "time_started" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "rating" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "rd" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Matches" ADD COLUMN "status" integer NOT NULL DEFAULT 0;
ALTER TABLE "Matches" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Matches" ADD COLUMN "team_votes" jsonb;--> statement-breakpoint
ALTER TABLE "Matches" ADD COLUMN "ongoing_match_channel_id" text;--> statement-breakpoint
ALTER TABLE "MatchPlayers" DROP COLUMN IF EXISTS "time_created";--> statement-breakpoint
ALTER TABLE "Matches" DROP COLUMN IF EXISTS "team_players";