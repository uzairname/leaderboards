import { sql } from 'drizzle-orm'
import {
  Players,
  Matches,
  LeaderboardDivisions,
  Leaderboards,
  Guilds,
  Users,
  QueueTeams,
  Settings,
} from '../database/schema'
import { DbClient } from '../database/client'
import { config, sentry } from '../utils/globals'
import { getTableConfig } from 'drizzle-orm/pg-core'

export async function runTests(): Promise<Response> {
  if (!config.env.POSTGRES_URL_TEST) {
    throw new Error('POSTGRES_URL_TEST not set')
  }

  await testDatabase(config.env.POSTGRES_URL_TEST)
  console.log(`Tested Leaderboards app (${config.env.ENVIRONMENT})`)
  return new Response('Successfully tested Leaderboards app', { status: 200 })
}

async function testDatabase(postgres_url: string) {
  sentry.debug('testing database')
  let client = new DbClient(sentry, postgres_url)
  await client.db.delete(Settings)
  await client.db.delete(QueueTeams)
  await client.db.delete(Players)
  await client.db.delete(Matches)
  await client.db.delete(LeaderboardDivisions)
  await client.db.delete(Leaderboards)
  await client.db.delete(Guilds)
  await client.db.delete(Users)

  const table_config = getTableConfig(Users)

  sentry.debug(table_config.foreignKeys.map((fk) => fk.onDelete).join(', '))

  const setting = await client.settings.getOrUpdate()

  await client.guilds.create({
    id: '123',
  })

  const guild1 = await client.guilds.create({
    id: '9862345',
  })

  const user1 = await client.users.getOrCreate({
    id: '1',
  })
  await client.users.getOrCreate({
    id: '2',
  })
  await client.users.getOrCreate({
    id: '3',
  })

  const leaderboard = await client.leaderboards.create({
    name: 'test',
    owner_guild_id: '123',
  })

  const guild_lb = client.guild_leaderboards.create(guild1, leaderboard, {})

  const division = await leaderboard.createDivision(
    {
      name: 'default',
    },
    true,
  )

  const player = await client.players.create(user1, division)

  let team1 = await client.queue_teams.create({
    queued_lb_division_id: division.data.id,
    user_ids: [user1.data.id, '2'],
  })

  const existing_team = team1.data.user_ids ?? []
  team1 = await team1.update({
    user_ids: existing_team.concat(['3']),
  })

  const q_team_1 = await client.queue_teams.getByUser(user1.data.id)
  assert(q_team_1[0].data.user_ids !== null)
  assert(q_team_1[0].data.user_ids.includes('3'), 'team 1 should include user 3')

  await leaderboard.delete()

  assert(
    (await client.leaderboards.get(leaderboard.data.id)) == undefined,
    'leaderboard should be deleted',
  )

  const user1_player = await client.players.get(user1.data.id, division.data.id)
  assert(user1_player == undefined, 'user 1 should have no players')

  // let selected_team = await client.queue_teams.getByUserAndDivision(user1.data.id, division.data.id);
}

runTests().then((res) => {
  process.exit(0)
})

function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? 'Assertion failed')
  }
}
