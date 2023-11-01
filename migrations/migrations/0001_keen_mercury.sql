ALTER TABLE "Matches" RENAME COLUMN "team_players" TO "team_users";--> statement-breakpoint
ALTER TABLE "GuildRankings" ADD COLUMN "queue_channel_id" text;--> statement-breakpoint
ALTER TABLE "Matches" ADD COLUMN "summary_channel_id" text;--> statement-breakpoint
ALTER TABLE "Matches" ADD COLUMN "summary_message_id" text;--> statement-breakpoint
ALTER TABLE "Guilds" DROP COLUMN IF EXISTS "channel_settings";--> statement-breakpoint
ALTER TABLE "Matches" DROP COLUMN IF EXISTS "status";--> statement-breakpoint
ALTER TABLE "Matches" DROP COLUMN IF EXISTS "team_votes";