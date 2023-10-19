ALTER TABLE "AccessTokens" DROP CONSTRAINT "AccessTokens_user_id_Users_id_fk";

ALTER TABLE "GuildLeaderboards" DROP CONSTRAINT "GuildLeaderboards_guild_id_Guilds_id_fk";

ALTER TABLE "LeaderboardDivisions" DROP CONSTRAINT "LeaderboardDivisions_leaderboard_id_Leaderboards_id_fk";

ALTER TABLE "Leaderboards" DROP CONSTRAINT "Leaderboards_owner_guild_id_Guilds_id_fk";

ALTER TABLE "Matches" DROP CONSTRAINT "Matches_lb_division_id_LeaderboardDivisions_id_fk";

ALTER TABLE "Players" DROP CONSTRAINT "Players_user_id_Users_id_fk";

ALTER TABLE "QueueTeams" DROP CONSTRAINT "QueueTeams_leaderboard_division_id_LeaderboardDivisions_id_fk";

ALTER TABLE "Matches" ALTER COLUMN "team_players" SET DATA TYPE jsonb;
DO $$ BEGIN
 ALTER TABLE "AccessTokens" ADD CONSTRAINT "AccessTokens_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "GuildLeaderboards" ADD CONSTRAINT "GuildLeaderboards_guild_id_Guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "Guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "LeaderboardDivisions" ADD CONSTRAINT "LeaderboardDivisions_leaderboard_id_Leaderboards_id_fk" FOREIGN KEY ("leaderboard_id") REFERENCES "Leaderboards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Leaderboards" ADD CONSTRAINT "Leaderboards_owner_guild_id_Guilds_id_fk" FOREIGN KEY ("owner_guild_id") REFERENCES "Guilds"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Matches" ADD CONSTRAINT "Matches_lb_division_id_LeaderboardDivisions_id_fk" FOREIGN KEY ("lb_division_id") REFERENCES "LeaderboardDivisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_user_id_Users_id_fk" FOREIGN KEY ("user_id") REFERENCES "Users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "QueueTeams" ADD CONSTRAINT "QueueTeams_leaderboard_division_id_LeaderboardDivisions_id_fk" FOREIGN KEY ("leaderboard_division_id") REFERENCES "LeaderboardDivisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;



ALTER TABLE "GuildLeaderboards" DROP CONSTRAINT "GuildLeaderboards_leaderboard_id_Leaderboards_id_fk";

ALTER TABLE "Players" DROP CONSTRAINT "Players_lb_division_id_LeaderboardDivisions_id_fk";

DO $$ BEGIN
 ALTER TABLE "GuildLeaderboards" ADD CONSTRAINT "GuildLeaderboards_leaderboard_id_Leaderboards_id_fk" FOREIGN KEY ("leaderboard_id") REFERENCES "Leaderboards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "Players" ADD CONSTRAINT "Players_lb_division_id_LeaderboardDivisions_id_fk" FOREIGN KEY ("lb_division_id") REFERENCES "LeaderboardDivisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
