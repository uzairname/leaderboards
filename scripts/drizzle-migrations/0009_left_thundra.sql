DROP INDEX IF EXISTS "player_user_id_index";--> statement-breakpoint
DROP INDEX IF EXISTS "player_ranking_id_index";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "player_user_id_ranking_id_unique" ON "Players" USING btree ("user_id","ranking_id");