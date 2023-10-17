CREATE TABLE IF NOT EXISTS "AccessTokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"purpose" text,
	"data" jsonb
);

CREATE TABLE IF NOT EXISTS "GuildLeaderboards" (
	"guild_id" text NOT NULL,
	"leaderboard_id" integer NOT NULL,
	"is_admin" boolean DEFAULT false,
	"display_channel_id" text,
	"display_message_id" text,
	"queue_message_id" text
);
--> statement-breakpoint
ALTER TABLE "GuildLeaderboards" ADD CONSTRAINT "GuildLeaderboards_guild_id_leaderboard_id" PRIMARY KEY("guild_id","leaderboard_id");

CREATE TABLE IF NOT EXISTS "Guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"admin_role_id" text,
	"category_id" text,
	"match_results_text_channel_id" text
);

CREATE TABLE IF NOT EXISTS "LeaderboardDivisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"leaderboard_id" integer NOT NULL,
	"name" text,
	"time_created" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Leaderboards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_guild_id" text NOT NULL,
	"default_division_id" integer,
	"time_created" timestamp DEFAULT now(),
	"players_per_team" integer DEFAULT 1,
	"queue_type" integer
);

CREATE TABLE IF NOT EXISTS "Matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"lb_division_id" integer NOT NULL,
	"status" integer,
	"team_players" json,
	"team_votes" jsonb,
	"outcome" jsonb,
	"time_started" timestamp,
	"time_finished" timestamp,
	"metadata" jsonb
);

CREATE TABLE IF NOT EXISTS "Players" (
	"user_id" text NOT NULL,
	"lb_division_id" integer NOT NULL,
	"nickname" text,
	"rating" real,
	"rd" real,
	"stats" jsonb,
	"time_created" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "Players" ADD CONSTRAINT "Players_user_id_lb_division_id" PRIMARY KEY("user_id","lb_division_id");

CREATE TABLE IF NOT EXISTS "QueueTeams" (
	"id" serial PRIMARY KEY NOT NULL,
	"leaderboard_division_id" integer,
	"user_ids" jsonb,
	"pending_user_ids" jsonb,
	"mmr" real,
	"time_joined_queue" timestamp
);

CREATE TABLE IF NOT EXISTS "Settings" (
	"id" integer PRIMARY KEY DEFAULT 0 NOT NULL,
	"last_deployed" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text
);

CREATE INDEX IF NOT EXISTS "LeaderboardDivision_by_leaderboard_id" ON "LeaderboardDivisions" ("leaderboard_id");
DO $$ BEGIN
 ALTER TABLE "AccessTokens" ADD CONSTRAINT "AccessTokens_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "GuildLeaderboards" ADD CONSTRAINT "GuildLeaderboards_guild_id_Guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "Guilds"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "GuildLeaderboards" ADD CONSTRAINT "GuildLeaderboards_leaderboard_id_Leaderboards_id_fk" FOREIGN KEY ("leaderboard_id") REFERENCES "Leaderboards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "LeaderboardDivisions" ADD CONSTRAINT "LeaderboardDivisions_leaderboard_id_Leaderboards_id_fk" FOREIGN KEY ("leaderboard_id") REFERENCES "Leaderboards"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Leaderboards" ADD CONSTRAINT "Leaderboards_owner_guild_id_Guilds_id_fk" FOREIGN KEY ("owner_guild_id") REFERENCES "Guilds"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Matches" ADD CONSTRAINT "Matches_lb_division_id_LeaderboardDivisions_id_fk" FOREIGN KEY ("lb_division_id") REFERENCES "LeaderboardDivisions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_lb_division_id_LeaderboardDivisions_id_fk" FOREIGN KEY ("lb_division_id") REFERENCES "LeaderboardDivisions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "QueueTeams" ADD CONSTRAINT "QueueTeams_leaderboard_division_id_LeaderboardDivisions_id_fk" FOREIGN KEY ("leaderboard_division_id") REFERENCES "LeaderboardDivisions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
