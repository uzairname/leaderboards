ALTER TABLE "ActiveMatches" RENAME COLUMN "team_users" TO "team_players";--> statement-breakpoint
ALTER TABLE "Matches" RENAME COLUMN "team_users" TO "team_players";--> statement-breakpoint
ALTER TABLE "Settings" ALTER COLUMN "id" SET DEFAULT 1;