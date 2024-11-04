import { exists, sql } from 'drizzle-orm'
import { } from '../src/database/client'
import { DrizzleClient, getNeonDrizzleClient } from '../src/database/drizzle-client'
import { AccessTokens, GuildRankings, Guilds, Matches, MatchPlayers, MatchSummaryMessages, Players, QueueTeams, Rankings, Settings, TeamPlayers, Teams, Users } from '../src/database/schema'
import dotenv from 'dotenv'
import { assert, nonNullable } from '../src/utils/utils'

dotenv.config()

async function resetDatabase() {
  if (process.env.ENVIRONMENT !== 'development') {
    process.exit(1)
  }

  const db = getNeonDrizzleClient(nonNullable(process.env.POSTGRES_URL, 'postgres_url'))

  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
  await db.execute(sql`DROP TABLE IF EXISTS "MatchPlayers"`)
  await db.execute(sql`DROP TABLE IF EXISTS "MatchSummaryMessages"`)
  await db.execute(sql`DROP TABLE IF EXISTS "Matches"`)
  await db.execute(sql`DROP TABLE IF EXISTS "QueueTeams"`)
  await db.execute(sql`DROP TABLE IF EXISTS "TeamPlayers"`)
  await db.execute(sql`DROP TABLE IF EXISTS "Teams"`)
  await db.execute(sql`DROP TABLE IF EXISTS "Players"`)
  await db.execute(sql`DROP TABLE IF EXISTS "GuildRankings"`)
  await db.execute(sql`DROP TABLE IF EXISTS "Rankings"`)
  await db.execute(sql`DROP TABLE IF EXISTS "Guilds"`)
  await db.execute(sql`DROP TABLE IF EXISTS "AccessTokens"`)
  await db.execute(sql`DROP TABLE IF EXISTS "Users"`)
  await db.execute(sql`DROP TABLE IF EXISTS "Settings"`)
}

resetDatabase().then(() => {
  console.log('Database reset')
  process.exit(0)
})