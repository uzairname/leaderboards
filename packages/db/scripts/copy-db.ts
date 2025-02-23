import { nonNullable } from '@repo/utils'
import dotenv from 'dotenv'
import { and, eq } from 'drizzle-orm'
import { getNeonDrizzleClient } from '../src/drizzle-client'
import { GuildRankings, Guilds, Matches, MatchPlayers, Players, Rankings, Users } from '../src/schema'

dotenv.config({ path: '.env.prod' })

const sourceurl = nonNullable(process.env.POSTGRES_READ_URL)

// delete prod env variables
delete process.env.POSTGRES_URL
delete process.env.POSTGRES_READ_URL

dotenv.config({ path: '.env' })

const targeturl = nonNullable(process.env.POSTGRES_URL)

async function copy_values() {
  // copies certain rows from the source database to the target database
  // const sourceClient = postgres(sourceurl)
  // const targetClient = postgres(targeturl)

  const fromDb = getNeonDrizzleClient(sourceurl)
  const toDb = getNeonDrizzleClient(targeturl)

  const from_guild_id = '1264804225804668981'
  const ranking_id = 13

  const to_guild_id = '1003698664767762575'

  // copy guild
  const guild = await fromDb.select().from(Guilds).where(eq(Guilds.id, from_guild_id))
  await toDb.delete(Guilds).where(eq(Guilds.id, to_guild_id))
  await toDb
    .insert(Guilds)
    .values(guild.map(g => ({ ...g, id: to_guild_id, name: 'Dev Testing' })))
    .onConflictDoNothing()

  // copy ranking
  const ranking = await fromDb.select().from(Rankings).where(eq(Rankings.id, ranking_id))
  await toDb.delete(Rankings).where(eq(Rankings.id, ranking_id))
  await toDb.insert(Rankings).values(ranking).onConflictDoNothing()

  // copy guild_ranking
  const guild_ranking = await fromDb
    .select()
    .from(GuildRankings)
    .where(and(eq(GuildRankings.guild_id, guild[0].id), eq(GuildRankings.ranking_id, ranking_id)))
  await toDb
    .insert(GuildRankings)
    .values(guild_ranking.map(gr => ({ ...gr, guild_id: to_guild_id })))
    .onConflictDoNothing()

  // copy all users
  const users = await fromDb.select().from(Users)
  await toDb.insert(Users).values(users).onConflictDoNothing()

  // copy players in the ranking
  const players = await fromDb.select().from(Players).where(eq(Players.ranking_id, ranking_id))
  await toDb.insert(Players).values(players).onConflictDoNothing()

  // copy all matches in the ranking
  const matches = await fromDb.select().from(Matches).where(eq(Matches.ranking_id, ranking_id))
  await toDb.insert(Matches).values(matches).onConflictDoNothing()

  // copy all match_players for the matches in the ranking
  const match_players = await fromDb
    .select()
    .from(MatchPlayers)
    .innerJoin(Matches, eq(Matches.id, MatchPlayers.match_id))
    .where(eq(Matches.ranking_id, ranking_id))
  await toDb
    .insert(MatchPlayers)
    .values(match_players.map(m => m.MatchPlayers))
    .onConflictDoNothing()
}

copy_values().then(() => {
  console.log('done')
  process.exit(0)
})
