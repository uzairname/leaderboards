import pg from 'pg'
import dotenv from 'dotenv'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { matches_trigger_query } from './migrate'

dotenv.config()

async function transfer() {

  const client_old = await new pg.Pool({
    connectionString: process.env.POSTGRES_URL_PRODUCTION_OLD,
    ssl: true,
  }).connect()

  const client = await new pg.Pool({
    connectionString: process.env.POSTGRES_URL_PRODUCTION,
    ssl: true,
  }).connect()


  // transfer Users table
  const users = (await client_old.query('SELECT * FROM "Users";')).rows
  await client.query('DELETE FROM "Users";')
  for (const user of users) {
    await client.query(
      `INSERT INTO "Users" (id, name) VALUES ($1, $2);`,
      [
        user.id,
        user.name,
      ],
    )
  }


    // transfer Guilds table
    const guilds = (await client_old.query('SELECT * FROM "Guilds";')).rows
    await client.query('DELETE FROM "Guilds";')
    for (const guild of guilds) {
      await client.query(
        `INSERT INTO "Guilds" (id, name, time_created, category_id) VALUES ($1, $2, $3, $4);`,
        [
          guild.id,
          guild.name,
          guild.time_created,
          guild.category_id,
        ],
      )
    }


      // transfer Rankings table
  const rankings = (await client_old.query('SELECT * FROM "Rankings";')).rows
  await client.query('DELETE FROM "Rankings";')
  for (const ranking of rankings) {
    await client.query(
      `INSERT INTO "Rankings" (id, name, time_created, players_per_team, num_teams, elo_settings) VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        ranking.id,
        ranking.name,
        ranking.time_created,
        ranking.players_per_team,
        ranking.num_teams,
        ranking.elo_settings
      ],
    )
  }
  // get highest ranking id, update Ranking_id_seq
  const max_ranking_id = Math.max(...rankings.map((r) => r.id))
  await client.query(`ALTER SEQUENCE "Rankings_id_seq" RESTART WITH ${max_ranking_id + 1};`)



  
  // transfer GuildRankings table
  const guild_rankings = (await client_old.query('SELECT * FROM "GuildRankings";')).rows
  await client.query('DELETE FROM "GuildRankings";')
  for (const guild_ranking of guild_rankings) {
    await client.query(
      `INSERT INTO "GuildRankings" (guild_id, ranking_id, time_created, is_admin, leaderboard_channel_id, leaderboard_message_id) VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        guild_ranking.guild_id,
        guild_ranking.ranking_id,
        guild_ranking.time_created,
        guild_ranking.is_admin,
        guild_ranking.leaderboard_channel_id,
        guild_ranking.leaderboard_message_id,
      ],
    )
  }

  // transfer Players table
  const players = (await client_old.query('SELECT * FROM "Players";')).rows
  await client.query('DELETE FROM "Players";')  
  for (const player of players) {
    await client.query(
      `INSERT INTO "Players" (user_id, ranking_id, time_created, name, rating, rd) VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        player.user_id,
        player.ranking_id,
        player.time_created,
        player.name,
        player.rating,
        player.rd,
      ],
    )
  }

}


async function migrate_database() {
  const db = drizzle(postgres(process.env.POSTGRES_URL_PRODUCTION!, { ssl: 'require', max: 1 }))
  await migrate(db, { migrationsFolder: 'migrations/migrations' })
  await db.execute(matches_trigger_query)
}

// migrate_database().then(() => {
//   console.log('done')
//   process.exit(0)
// })

transfer().then(() => {
  console.log('done')
  process.exit(0)
})
