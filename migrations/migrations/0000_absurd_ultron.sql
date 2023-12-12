CREATE TABLE IF NOT EXISTS "AccessTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb,
	"purpose" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ActiveMatches" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"status" integer,
	"team_users" jsonb,
	"team_votes" jsonb,
	"channel_id" text,
	"message_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "GuildRankings" (
	"guild_id" text NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"is_admin" boolean,
	"leaderboard_channel_id" text,
	"leaderboard_message_id" text,
	"ongoing_matches_channel_id" text,
	"match_results_channel_id" text,
	"queue_channel_id" text,
	"queue_message_id" text,
	CONSTRAINT GuildRankings_guild_id_ranking_id PRIMARY KEY("guild_id","ranking_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"time_created" timestamp DEFAULT now(),
	"admin_role_id" text,
	"category_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MatchPlayers" (
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_num" integer,
	"rating_before" real,
	"rd_before" real,
	"time_created" timestamp DEFAULT now(),
	CONSTRAINT MatchPlayers_match_id_player_id PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MatchSummaryMessages" (
	"match_id" integer NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text,
	"message_id" text,
	CONSTRAINT MatchSummaryMessages_match_id_guild_id PRIMARY KEY("match_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"time_finished" timestamp,
	"number" integer,
	"team_users" jsonb,
	"outcome" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Players" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"name" text,
	"rating" real,
	"rd" real,
	"stats" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "QueueTeams" (
	"team_id" integer PRIMARY KEY NOT NULL,
	"time_created" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"time_created" timestamp DEFAULT now(),
	"players_per_team" integer,
	"num_teams" integer,
	"elo_settings" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Settings" (
	"id" integer PRIMARY KEY DEFAULT 0 NOT NULL,
	"last_deployed" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TeamPlayers" (
	"team_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	CONSTRAINT TeamPlayers_team_id_player_id PRIMARY KEY("team_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"rating" real,
	"name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"time_created" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_user_id_index" ON "Players" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_ranking_id_index" ON "Players" ("ranking_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccessTokens" ADD CONSTRAINT "AccessTokens_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ActiveMatches" ADD CONSTRAINT "ActiveMatches_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GuildRankings" ADD CONSTRAINT "GuildRankings_guild_id_Guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "Guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GuildRankings" ADD CONSTRAINT "GuildRankings_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchPlayers" ADD CONSTRAINT "MatchPlayers_match_id_Matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "Matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchPlayers" ADD CONSTRAINT "MatchPlayers_player_id_Players_id_fk" FOREIGN KEY ("player_id") REFERENCES "Players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchSummaryMessages" ADD CONSTRAINT "MatchSummaryMessages_match_id_Matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "Matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchSummaryMessages" ADD CONSTRAINT "MatchSummaryMessages_guild_id_Guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "Guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Matches" ADD CONSTRAINT "Matches_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "QueueTeams" ADD CONSTRAINT "QueueTeams_team_id_Teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "Teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "TeamPlayers" ADD CONSTRAINT "TeamPlayers_team_id_Teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "Teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "TeamPlayers" ADD CONSTRAINT "TeamPlayers_player_id_Players_id_fk" FOREIGN KEY ("player_id") REFERENCES "Players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Teams" ADD CONSTRAINT "Teams_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
