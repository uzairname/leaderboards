ALTER TABLE "GuildRankings" ADD COLUMN "display_settings" jsonb;--> statement-breakpoint
ALTER TABLE "GuildRankings" DROP COLUMN IF EXISTS "match_results_textchannel_id";--> statement-breakpoint
ALTER TABLE "GuildRankings" DROP COLUMN IF EXISTS "match_results_forum_id";