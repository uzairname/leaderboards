ALTER TABLE "Rankings" ALTER COLUMN "elo_settings" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "Rankings" ADD COLUMN IF NOT EXISTS "matchmaking_settings" jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_tokens_user_id_index" ON "AccessTokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_time_finished_index" ON "Matches" USING btree ("time_finished");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_rating_index" ON "Players" USING btree ("rating");