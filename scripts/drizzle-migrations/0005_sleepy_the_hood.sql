-- change to lowercase
ALTER TABLE "GuildRankings" DROP CONSTRAINT "guildrankings_guild_id_ranking_id";--> statement-breakpoint
ALTER TABLE "MatchPlayers" DROP CONSTRAINT "matchplayers_match_id_player_id";--> statement-breakpoint
ALTER TABLE "MatchSummaryMessages" DROP CONSTRAINT "matchsummarymessages_match_id_guild_id";--> statement-breakpoint
ALTER TABLE "TeamPlayers" DROP CONSTRAINT "teamplayers_team_id_player_id";--> statement-breakpoint

ALTER TABLE "GuildRankings" ADD CONSTRAINT "GuildRankings_guild_id_ranking_id_pk" PRIMARY KEY("guild_id","ranking_id");--> statement-breakpoint
ALTER TABLE "MatchPlayers" ADD CONSTRAINT "MatchPlayers_match_id_player_id_pk" PRIMARY KEY("match_id","player_id");--> statement-breakpoint
ALTER TABLE "MatchSummaryMessages" ADD CONSTRAINT "MatchSummaryMessages_match_id_guild_id_pk" PRIMARY KEY("match_id","guild_id");--> statement-breakpoint
ALTER TABLE "TeamPlayers" ADD CONSTRAINT "TeamPlayers_team_id_player_id_pk" PRIMARY KEY("team_id","player_id");--> statement-breakpoint
-- add "if not exists"
ALTER TABLE "MatchSummaryMessages" ADD COLUMN IF NOT EXISTS "channel_id" text NOT NULL;