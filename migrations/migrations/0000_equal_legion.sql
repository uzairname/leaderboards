CREATE TABLE IF NOT EXISTS "AccessTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "GuildRankings" (
	"guild_id" text NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"is_admin" boolean,
	"leaderboard_channel_id" text,
	"leaderboard_message_id" text,
	"queue_message_id" text,
	CONSTRAINT GuildRankings_guild_id_ranking_id PRIMARY KEY("guild_id","ranking_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"time_created" timestamp DEFAULT now(),
	"admin_role_id" text,
	"category_id" text,
	"match_results_text_channel_id" text,
	"channel_settings" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_division_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"number" integer,
	"status" integer,
	"team_players" jsonb,
	"team_votes" jsonb,
	"time_finished" timestamp,
	"outcome" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Players" (
	"user_id" text NOT NULL,
	"ranking_division_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"nickname" text,
	"rating" real,
	"rd" real,
	"stats" jsonb,
	CONSTRAINT Players_user_id_ranking_division_id PRIMARY KEY("user_id","ranking_division_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "QueueTeams" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_division_id" integer,
	"user_ids" jsonb,
	"pending_user_ids" jsonb,
	"mmr" real,
	"time_joined_queue" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "RankingDivisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ranking_id" integer NOT NULL,
	"time_created" timestamp DEFAULT now(),
	"name" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Rankings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"time_created" timestamp DEFAULT now(),
	"current_division_id" integer,
	"players_per_team" integer,
	"num_teams" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Settings" (
	"id" integer PRIMARY KEY DEFAULT 0 NOT NULL,
	"last_deployed" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "RankingDivision_by_ranking_id" ON "RankingDivisions" ("ranking_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AccessTokens" ADD CONSTRAINT "AccessTokens_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "Matches" ADD CONSTRAINT "Matches_ranking_division_id_RankingDivisions_id_fk" FOREIGN KEY ("ranking_division_id") REFERENCES "RankingDivisions"("id") ON DELETE cascade ON UPDATE no action;
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
 ALTER TABLE "Players" ADD CONSTRAINT "Players_ranking_division_id_RankingDivisions_id_fk" FOREIGN KEY ("ranking_division_id") REFERENCES "RankingDivisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "QueueTeams" ADD CONSTRAINT "QueueTeams_ranking_division_id_RankingDivisions_id_fk" FOREIGN KEY ("ranking_division_id") REFERENCES "RankingDivisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "RankingDivisions" ADD CONSTRAINT "RankingDivisions_ranking_id_Rankings_id_fk" FOREIGN KEY ("ranking_id") REFERENCES "Rankings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
