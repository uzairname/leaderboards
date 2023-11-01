import {
  Players,
  Matches,
  RankingDivisions,
  Rankings,
  Guilds,
  Users,
  QueueTeams,
  Settings,
  AccessTokens,
} from '../src/database/schema'
import { DbClient } from '../src/database/client'
import { Env } from '../src/utils/request'
import { App } from '../src/app/app'
import { initSentry } from '../src/utils/globals'
import { onJoinQueue } from '../src/app/modules/queue'
import { APIUser } from 'discord-api-types/v10'
import { getOrAddGuild } from '../src/app/modules/guilds'
import test_env from './test_env'


export async function runTests(): Promise<Response> {
  const ctx = {
    request: new Request('https://example.com'),
    env: test_env,
    execution_context: {
      waitUntil: (promise: Promise<any>) => {
        promise.then(() => {})
      },
      passThroughOnException: () => {},
    },
  }

  const app = new App(ctx, initSentry(ctx))

  await testDatabase(app)
  console.log(`Tested Leaderboards app (${ctx.env.ENVIRONMENT})`)
  return new Response('Successfully tested Leaderboards app', { status: 200 })
}

async function testDatabase(app: App) {
  app.sentry.debug('testing database')
  await app.db.settings.getOrUpdate()

  await testLeaderboards(app)
}

async function testLeaderboards(app: App) {
  await resetDatabase(app.db)
  await addData(app.db)

  const ranking = (await getRankingByName(app, '98623457887', 'ranking 1')).ranking
  const division = await app.db.ranking_divisions.getOrFail(ranking.data.current_division_id)

  let user1_player = await app.db.players.get('100', division.data.id)
  assert(user1_player?.data.user_id === '100', 'user 1 should have a player')

  let team1 = await app.db.queue_teams.create({
    queued_ranking_division_id: division.data.id,
    user_ids: ['100', '400'],
  })

  const existing_team = team1.data.user_ids ?? []

  team1 = await team1.update({
    user_ids: existing_team.concat(['300']),
  })

  const team_1 = await app.db.queue_teams.getByUser('100')
  assert(team_1[0].data.user_ids !== null)
  assert(team_1[0].data.user_ids.includes('300'), 'team 1 should include user 300')

  // await leaderboard1.delete()
  // assert(
  //   (await client.leaderboards.get(leaderboard1.data.id)) == undefined,
  //   'leaderboard should be deleted',
  // )
  // user1_player = await client.players.get(user1.data.id, division.data.id)
  // assert(user1_player == undefined, 'user 1 should have no players')

  let discord_user: APIUser = {
    id: '648358762',
    username: 'apiuser1',
    global_name: 'apiuser1',
    discriminator: '1234',
    avatar: '',
  }

  await onJoinQueue(app, division.data.id, discord_user)

  const team = await app.db.queue_teams.getByUserAndDivision(discord_user.id, division.data.id)

  assert(team?.data.user_ids?.includes(discord_user.id) || false, 'team should include user')
}

async function getRankingByName(app: App, guild_id: string, name: string) {
  const guild = await getOrAddGuild(app, guild_id)
  const rankings = await guild?.guildRankings()
  const ranking = rankings.find((r) => r.ranking.data.name === name)
  assert(ranking !== undefined, `ranking ${name} should exist`)
  return ranking
}

async function resetDatabase(client: DbClient) {
  await client.db.delete(Settings)
  await client.db.delete(QueueTeams)
  await client.db.delete(Players)
  await client.db.delete(Matches)
  await client.db.delete(RankingDivisions)
  await client.db.delete(Rankings)
  await client.db.delete(Guilds)
  await client.db.delete(AccessTokens)
  await client.db.delete(Users)
}

async function addData(client: DbClient) {
  const guild = await client.guilds.create({ id: '98623457887' })
  await Promise.all([
    client.users.getOrCreate({ id: '100' }),
    client.users.getOrCreate({ id: '200' }),
    client.users.getOrCreate({ id: '300' }),
  ])

  const ranking = await client.rankings.create({
    name: 'ranking 1',
    players_per_team: 2,
    num_teams: 2,
  })
  const guild_lb = client.guild_rankings.create(guild, ranking, { is_admin: true })
  const division = await ranking.createDivision({ name: 'default' }, true)

  await Promise.all([
    client.players.create(await client.users.getOrCreate({ id: '100' }), division),
    client.players.create(await client.users.getOrCreate({ id: '200' }), division),
    client.players.create(await client.users.getOrCreate({ id: '300' }), division),
  ])
}

runTests().then((res) => {
  process.exit(0)
})

function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? 'Assertion failed')
  }
}
