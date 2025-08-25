ALTER TABLE "Rankings" ALTER COLUMN "matchmaking_settings" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "Guilds" ADD COLUMN "admin_channel_id" text;--> statement-breakpoint
ALTER TABLE "Matches" ADD COLUMN "team_votes_new" jsonb;--> statement-breakpoint
ALTER TABLE "Matches" ADD COLUMN "outcome_new" jsonb;--> statement-breakpoint
ALTER TABLE "Rankings" ADD COLUMN "sharing_settings" jsonb;--> statement-breakpoint
CREATE INDEX "player_name_index" ON "Players" USING btree ("name");