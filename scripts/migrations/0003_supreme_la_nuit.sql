ALTER TABLE "AccessTokens" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "GuildRankings" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Guilds" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "MatchSummaryMessages" ALTER COLUMN "message_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Players" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "QueueTeams" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Rankings" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Rankings" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Rankings" ALTER COLUMN "players_per_team" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Rankings" ALTER COLUMN "num_teams" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Settings" ALTER COLUMN "last_deployed" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "TeamPlayers" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Teams" ALTER COLUMN "time_created" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Users" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Users" ALTER COLUMN "time_created" SET NOT NULL;