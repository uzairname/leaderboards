import {
  Players,
  Matches,
  Rankings,
  Guilds,
  Users,
  QueueTeams,
  Settings,
  AccessTokens,
} from '../database/schema'
import { DbClient } from '../database/client'
import { App } from '../app/app'
import { initSentry } from '../logging/globals'
import { onJoinQueue } from '../app/modules/queue'
import { APIUser } from 'discord-api-types/v10'
import { getOrAddGuild } from '../app/modules/guilds'
import test_env from './test_env'
import { sentry } from '../logging/globals'
import { getRegisterPlayer } from '../app/modules/players'
import { assertValue } from '../utils/utils'

export async function runTests(app: App): Promise<Response> {
  // const ctx = {
  //   request: new Request('https://example.com'),
  //   env: test_env,
  //   execution_context: {
  //     waitUntil: (promise: Promise<any>) => {
  //       promise.then(() => {})
  //     },
  //     passThroughOnException: () => {},
  //   },
  // }

  // const app = new App(ctx, initSentry(ctx))

  await testDatabase(app)
  sentry.debug(`Tested Leaderboards app (${app.config.env.ENVIRONMENT})`)
  return new Response('Successfully tested Leaderboards app', { status: 200 })
}

async function testDatabase(app: App) {
  app.sentry.debug('testing database')
  await app.db.settings.getOrUpdate()

  await testLeaderboards(app)
}

async function testLeaderboards(app: App) {
  sentry.debug('resetting database')
  await resetDatabase(app.db)
  sentry.debug('adding data')
  await addData(app.db)

  const ranking = (await getRankingByName(app, '98623457887', 'ranking 1')).ranking
  const ranking2 = (await getRankingByName(app, '98623457887', 'ranking 2')).ranking

  const player100 = await app.db.players.get('100', ranking.data.id)
  assertValue(player100, 'player 100 should exist')
  const player200 = await app.db.players.get('200', ranking.data.id)
  assertValue(player200, 'player 200 should exist')
  const player300 = await app.db.players.get('300', ranking.data.id)
  assertValue(player300, 'player 300 should exist')
  const player400 = await app.db.players.get('400', ranking.data.id)
  assertValue(player400, 'player 400 should exist')
  const player100_2 = await app.db.players.get('100', ranking2.data.id)
  assertValue(player100_2, 'player 100 should exist in ranking 2')
  const player400_2 = await app.db.players.get('400', ranking2.data.id)
  assertValue(player400_2, 'player 400 should exist in ranking 2')


  // user 100 and 400 join a team
  const team_1 = await app.db.teams.create(ranking, {}, [player100, player400])

  // the team joins the queue for ranking 1
  let queue_team1 = await team_1.addToQueue()

  // the same players join the queue for ranking 2
  const team_1_2 = await app.db.teams.create(ranking2, {}, [player100_2, player400_2])
  let queue_team12 = await team_1_2.addToQueue()

  // user 200 and 300 join the queue for ranking 1
  const team_2 = await app.db.teams.create(ranking, {}, [player200, player300])
  let queue_team2 = await team_2.addToQueue()

  // user 100 and 300 join the queue for ranking 1
  const team_3 = await app.db.teams.create(ranking, {}, [player100, player300])
  let queue_team3 = await team_3.addToQueue()
  // add to queue again. shouldn't error
  queue_team3 = await team_3.addToQueue()


  // get player 100's queue teams. should be team 1 and 3
  let player100_queue_teams = await player100.queueTeams()
  assert(player100_queue_teams.length == 2, 'player 100 should be in queue team 1 and 3')


  // user 100 leaves the queue
  await player100.removeTeamsFromQueue()

  assert((await player100.queueTeams()).length == 0, 'player 200 should not be in queue')
  assert((await player200.queueTeams()).length == 1, 'player 200 should be in queue team 2')
  assert((await player300.queueTeams()).length == 2, 'player 300 should be in queue team 2 and 3')
  assert((await player100_2.queueTeams()).length == 1, 'player 100 should still be in queue team 12')


  // let discord_user: APIUser = {
  //   id: '648358762',
  //   username: 'apiuser1',
  //   global_name: 'apiuser1',
  //   discriminator: '1234',
  //   avatar: '',
  // }

  // await onJoinQueue(app, ranking.data.id, discord_user)


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
  await client.db.delete(Rankings)
  await client.db.delete(Guilds)
  await client.db.delete(AccessTokens)
  await client.db.delete(Users)
}

async function addData(client: DbClient) {
  const guild1 = await client.guilds.create({ id: '98623457887' })
  await Promise.all([
    client.users.getOrCreate({ id: '100', name: 'one' }),
    client.users.getOrCreate({ id: '200', name: 'two' }),
    client.users.getOrCreate({ id: '300', name: 'three' }),
    client.users.getOrCreate({ id: '400', name: 'four' }),
  ])

  const ranking1 = await client.rankings.create({
    name: 'ranking 1',
    players_per_team: 2,
    num_teams: 2,
  })

  const ranking2 = await client.rankings.create({
    name: 'ranking 2',
    players_per_team: 2,
    num_teams: 2,
  })

  const guild_lb = await client.guild_rankings.create(guild1, ranking1, { is_admin: true })

  await Promise.all([
    client.players.create(await client.users.getOrCreate({ id: '100' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '200' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '300' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '400' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '100' }), ranking2),
    client.players.create(await client.users.getOrCreate({ id: '200' }), ranking2),
    client.players.create(await client.users.getOrCreate({ id: '300' }), ranking2),
    client.players.create(await client.users.getOrCreate({ id: '400' }), ranking2),
  ])
}

// runTests().then((res) => {
//   process.exit(0)
// })

function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? 'Assertion failed')
  }
}
