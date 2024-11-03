ALTER TABLE "Rankings" RENAME COLUMN "num_teams" TO "teams_per_match";--> statement-breakpoint
ALTER TABLE "Rankings" RENAME COLUMN "elo_settings" TO "initial_rating";--> statement-breakpoint
DROP INDEX IF EXISTS "player_rating_index";--> statement-breakpoint
ALTER TABLE "Guilds" DROP COLUMN IF EXISTS "version";--> statement-breakpoint

-- done in migrate.ts
-- ALTER TABLE "Players" ALTER COLUMN "rating" SET DATA TYPE jsonb;--> statement-breakpoint
-- ALTER TABLE "MatchPlayers" ADD COLUMN "rating" jsonb NOT NULL;--> statement-breakpoint
-- ALTER TABLE "MatchPlayers" DROP COLUMN IF EXISTS "rating_before";--> statement-breakpoint
-- ALTER TABLE "MatchPlayers" DROP COLUMN IF EXISTS "rd_before";--> statement-breakpoint
-- ALTER TABLE "Players" DROP COLUMN IF EXISTS "rd";