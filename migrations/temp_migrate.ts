import pg from 'pg'
import fastcsv from 'fast-csv'
import fs from 'fs'
import dotenv from 'dotenv'


dotenv.config()

async function download() {
  // download all tables from database as csv files
  const pool = new pg.Pool({
    connectionString: process.env.POSTGRES_URL_PRODUCTION_OLD,
    ssl: true,
  })

  const client = await pool.connect()
  const res = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';",
  )
  const tables = res.rows.map((row) => row.table_name)

  console.log(tables)

  for (const table of tables) {
    const res = await client.query(`SELECT * FROM "${table}";`)
    const rows = res.rows
    // create csv file if not exists
    const ws = fs.createWriteStream(`temp_data/${table}.csv`)
    fastcsv.write(rows, { headers: true }).pipe(ws)
  }
}

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
      `INSERT INTO "Guilds" (id, name, time_created, admin_role_id, category_id) VALUES ($1, $2, $3, $4, $5);`,
      [
        guild.id,
        guild.name,
        guild.time_created,
        guild.admin_role_id,
        guild.category_id,
      ],
    )
  }

  // transfer Rankings table
  const rankings = (await client_old.query('SELECT * FROM "Rankings";')).rows
  await client.query('DELETE FROM "Rankings";')
  for (const ranking of rankings) {
    await client.query(
      `INSERT INTO "Rankings" (id, name, time_created, players_per_team, num_teams) VALUES ($1, $2, $3, $4, $5);`,
      [
        ranking.id,
        ranking.name,
        ranking.time_created,
        ranking.players_per_team,
        ranking.num_teams,
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
      `INSERT INTO "GuildRankings" (guild_id, ranking_id, time_created, is_admin, leaderboard_channel_id, leaderboard_message_id, queue_channel_id, queue_message_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        guild_ranking.guild_id,
        guild_ranking.ranking_id,
        guild_ranking.time_created,
        guild_ranking.is_admin,
        guild_ranking.leaderboard_channel_id,
        guild_ranking.leaderboard_message_id,
        guild_ranking.queue_channel_id,
        guild_ranking.queue_message_id,
      ],
    )
  }


  // merge Rankings and RankingDivisions tables
  const ranking_divisions = (await client_old.query('SELECT * FROM "RankingDivisions";')).rows
  const ranking_divisions_to_rankings: { [key: number]: number } = {}
  for (const ranking_division of ranking_divisions) {
    ranking_divisions_to_rankings[ranking_division.id] = ranking_division.ranking_id
  }

  console.log(ranking_divisions_to_rankings)


  // transfer Players table
  const players = (await client_old.query('SELECT * FROM "Players";')).rows
  await client.query('DELETE FROM "Players";')  
  for (const player of players) {
    await client.query(
      `INSERT INTO "Players" (user_id, ranking_id, time_created, name, rating, rd) VALUES ($1, $2, $3, $4, $5, $6);`,
      [
        player.user_id,
        ranking_divisions_to_rankings[player.ranking_division_id],
        player.time_created,
        player.nickname,
        player.rating,
        player.rd,
      ],
    )
  }





}

// download().then(() => {
//     console.log("done");
//     process.exit(0);
// })

transfer().then(() => {
  console.log('done')
  process.exit(0)
})
