ALTER TABLE "GuildRankings" ADD COLUMN "matchmaking_settings" jsonb;--> statement-breakpoint
ALTER TABLE "GuildRankings" ADD COLUMN "rating_roles" jsonb;--> statement-breakpoint
ALTER TABLE "Guilds" ADD COLUMN "ephemeral_commands" boolean DEFAULT false NOT NULL;