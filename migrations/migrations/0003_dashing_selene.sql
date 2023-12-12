ALTER TABLE "GuildRankings" ADD COLUMN "match_results_textchannel_id" text;--> statement-breakpoint
ALTER TABLE "GuildRankings" ADD COLUMN "match_results_forum_id" text;--> statement-breakpoint
ALTER TABLE "Guilds" ADD COLUMN "match_results_textchannel_id" text;--> statement-breakpoint
ALTER TABLE "Guilds" ADD COLUMN "match_results_forum_id" text;--> statement-breakpoint
ALTER TABLE "MatchSummaryMessages" ADD COLUMN "forum_thread_id" text;--> statement-breakpoint
ALTER TABLE "GuildRankings" DROP COLUMN IF EXISTS "match_results_channel_id";--> statement-breakpoint
ALTER TABLE "MatchSummaryMessages" DROP COLUMN IF EXISTS "channel_id";