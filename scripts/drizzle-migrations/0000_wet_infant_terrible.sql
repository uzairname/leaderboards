CREATE TABLE IF NOT EXISTS "AccessTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "GuildRankings" (
	"guild_id" text NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL,
	"is_admin" boolean,
	"leaderboard_channel_id" text,
	"leaderboard_message_id" text,
	"display_settings" jsonb,
	CONSTRAINT "GuildRankings_guild_id_ranking_id_pk" PRIMARY KEY("guild_id","ranking_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL,
	"admin_role_id" text,
	"category_id" text,
	"matches_channel_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MatchPlayers" (
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"team_num" integer NOT NULL,
	"rating" jsonb NOT NULL,
	"flags" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "MatchPlayers_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MatchSummaryMessages" (
	"match_id" integer NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	CONSTRAINT "MatchSummaryMessages_match_id_guild_id_pk" PRIMARY KEY("match_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_id" integer NOT NULL,
	"number" integer,
	"time_started" timestamp,
	"time_finished" timestamp,
	"status" integer NOT NULL,
	"team_votes" jsonb,
	"ongoing_match_channel_id" text,
	"outcome" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Players" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"rating" jsonb NOT NULL,
	"flags" integer DEFAULT 0 NOT NULL,
	"stats" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "QueueTeams" (
	"team_id" integer PRIMARY KEY NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL,
	"players_per_team" integer NOT NULL,
	"teams_per_match" integer NOT NULL,
	"initial_rating" jsonb NOT NULL,
	"matchmaking_settings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"versions" jsonb NOT NULL,
	"config" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "TeamPlayers" (
	"team_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "TeamPlayers_team_id_player_id_pk" PRIMARY KEY("team_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL,
	"rating" real,
	"name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"time_created" timestamp DEFAULT now() NOT NULL,
	"linked_roles_ranking_id" integer
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccessTokens" ADD CONSTRAINT "AccessTokens_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."Users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GuildRankings" ADD CONSTRAINT "GuildRankings_guild_id_Guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."Guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GuildRankings" ADD CONSTRAINT "GuildRankings_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "public"."Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchPlayers" ADD CONSTRAINT "MatchPlayers_match_id_Matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."Matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchPlayers" ADD CONSTRAINT "MatchPlayers_player_id_Players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."Players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchSummaryMessages" ADD CONSTRAINT "MatchSummaryMessages_match_id_Matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."Matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatchSummaryMessages" ADD CONSTRAINT "MatchSummaryMessages_guild_id_Guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."Guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Matches" ADD CONSTRAINT "Matches_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "public"."Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."Users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "public"."Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "QueueTeams" ADD CONSTRAINT "QueueTeams_team_id_Teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."Teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "TeamPlayers" ADD CONSTRAINT "TeamPlayers_team_id_Teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."Teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "TeamPlayers" ADD CONSTRAINT "TeamPlayers_player_id_Players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."Players"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Teams" ADD CONSTRAINT "Teams_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "public"."Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_tokens_user_id_index" ON "AccessTokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_ranking_id_index" ON "Matches" USING btree ("ranking_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_time_finished_index" ON "Matches" USING btree ("time_finished");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_time_started_index" ON "Matches" USING btree ("time_started");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "player_user_id_ranking_id_unique" ON "Players" USING btree ("user_id","ranking_id");