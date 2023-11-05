import { APIUser } from 'discord-api-types/v10'
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
}

async function getRankingByName(app: App, guild_id: string, name: string) {
  const guild = await getOrAddGuild(app, guild_id)
  const rankings = await guild?.guildRankings()
  const ranking = rankings.find((r) => r.ranking.data.name === name)
  assert(ranking !== undefined, `ranking ${name} should exist`)
  return ranking
}

async function resetDatabase(client: DbClient) {
  await client.conn.delete(Settings)
  await client.conn.delete(QueueTeams)
  await client.conn.delete(Players)
  await client.conn.delete(Matches)
  await client.conn.delete(RankingDivisions)
  await client.conn.delete(Rankings)
  await client.conn.delete(Guilds)
  await client.conn.delete(AccessTokens)
  await client.conn.delete(Users)
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
