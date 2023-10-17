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
} from '../../database/schema'
import { DbClient } from '../../database/client'
import { config, sentry } from '../../utils/globals'

export async function runTests(): Promise<void> {
  if (!config.env.POSTGRES_URL_TEST) {
    throw new Error('POSTGRES_URL_TEST not set')
  }

  await testDatabase(config.env.POSTGRES_URL_TEST)
  console.log(`Tested Leaderboards app (${config.env.ENVIRONMENT})`)
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

  const setting = await client.settings.getOrUpdate()

  await client.guilds.create({
    id: '123',
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

  sentry.debug('team', JSON.stringify(team1.data))

  let query_result = await client.db.execute(sql`
        SELECT * FROM ${QueueTeams}
        WHERE ${QueueTeams.queued_lb_division_id} = ${division.data.id}
        AND ${QueueTeams.user_ids} ?| ARRAY[${user1.data.id}]
`)

  sentry.debug(query_result.rowCount, JSON.stringify(query_result.rows[0]))

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

