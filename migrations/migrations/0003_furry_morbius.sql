ALTER TABLE "Matches" RENAME COLUMN "time_created" TO "time_started";--> statement-breakpoint
ALTER TABLE "AccessTokens" ALTER COLUMN "id" SET DATA TYPE serial;--> statement-breakpoint
ALTER TABLE "AccessTokens" ALTER COLUMN "data" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Matches" ALTER COLUMN "time_started" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "AccessTokens" ADD COLUMN "expires_at" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "AccessTokens" ADD COLUMN "time_created" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "GuildRankings" ADD COLUMN "display_settings" jsonb;--> statement-breakpoint
ALTER TABLE "Guilds" ADD COLUMN "match_results_textchannel_id" text;--> statement-breakpoint
ALTER TABLE "Guilds" ADD COLUMN "match_results_forum_id" text;--> statement-breakpoint
ALTER TABLE "MatchSummaryMessages" ADD COLUMN "forum_thread_id" text;--> statement-breakpoint
ALTER TABLE "Users" ADD COLUMN "linked_roles_ranking_id" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_ranking_id_index" ON "Matches" ("ranking_id");--> statement-breakpoint
ALTER TABLE "AccessTokens" DROP COLUMN IF EXISTS "purpose";--> statement-breakpoint
ALTER TABLE "GuildRankings" DROP COLUMN IF EXISTS "match_results_channel_id";--> statement-breakpoint
ALTER TABLE "GuildRankings" DROP COLUMN IF EXISTS "queue_channel_id";--> statement-breakpoint
ALTER TABLE "GuildRankings" DROP COLUMN IF EXISTS "queue_message_id";--> statement-breakpoint
ALTER TABLE "MatchSummaryMessages" DROP COLUMN IF EXISTS "channel_id";