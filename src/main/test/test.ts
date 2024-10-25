import { APIUser } from 'discord-api-types/v10'
import { sql } from 'drizzle-orm'
import { sentry } from '../../logging'
import { assert, nonNullable } from '../../utils/utils'
import { updateMatch } from '../bot/modules/matches/management/manage_matches'
import { createAndScoreMatch } from '../bot/modules/matches/management/score_matches'
import { getOrCreatePlayer } from '../bot/modules/players/manage_players'
import { App } from '../context/app_context'
import { DbClient } from '../database/client'
import {
  AccessTokens,
  GuildRankings,
  Guilds,
  MatchPlayers,
  MatchSummaryMessages,
  Matches,
  Players,
  QueueTeams,
  Rankings,
  Settings,
  TeamPlayers,
  Teams,
  Users,
} from '../database/schema'





class Test {
  @catchError(3)
  async test() {
    throw 1
    return 'result'
  }
}

function catchError(x: number) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args)
      } catch (error) {
        throw x
      }
    }
    return descriptor
  }
}


export async function runTests(app: App): Promise<Response> {

  console.log('running tests')

  testTs()

  // await testDatabase(app)
  // sentry.debug(`Tested Leaderboards app (${app.config.env.ENVIRONMENT})`)
  return new Response(`Successfully tested Leaderboards app`, { status: 200 })
}

import { Rating, TrueSkill } from 'ts-trueskill'
import { Gaussian } from 'ts-gaussian'

function testTs() {

  function getAdjustedBeta(baseBeta: number, best_of: number): number {
    // Reduce the uncertainty for longer series
    return 7 * baseBeta / best_of;
  }

  const outcome = [0, 1]
  const best_of = 3

  const team_ranks = outcome.map(score => 1 - score)

  const elo_settings = {
    initial_rating: 50,
    initial_rd: 50 / 3,
  }

  const env = new TrueSkill(elo_settings.initial_rating, elo_settings.initial_rd)
  
  console.log(`Trueskill default beta: ${env.beta}, ${best_of}`)

  env.beta = getAdjustedBeta(env.beta, best_of ?? 1)
  // env.beta = env.beta * 2

  /*
  beta         (mu, sigma) after 1 win -> (mu, sigma) after 2 wins
  beta 999                (50.2, 16.7) -> (50.3, 16.7)
  beta 2*default                       -> (61.4, 14.2)
  beta default:           (58.8, 14.3) -> (62.4, 13.0)
  beta*1/sqrt(5)          (59.4, 13.9) -> (62.5, 12.5)
  beta 0:                 (59.4, 13.8) -> (62.3, 12.4)
  */


  console.log(getAdjustedBeta(env.beta, best_of ?? 1))

  console.log(`Trueskill beta: ${env.beta}`)

  const players = [[undefined], [undefined]]

  const old_player_ratings = players.map(team => {
    return team.map(player => {
      return player ?? env.createRating()
    })
  })

  console.log(old_player_ratings.map(t => t.map(r => ({ mu: r.mu, sigma: r.sigma }))))

  let new_player_ratings: Rating[][] = env.rate(old_player_ratings, team_ranks)
  new_player_ratings = env.rate(new_player_ratings, team_ranks)
  new_player_ratings = env.rate(new_player_ratings, team_ranks)

  console.log(new_player_ratings.map(t => t.map(r => ({ mu: r.mu, sigma: r.sigma }))))

}


async function testDatabase(app: App) {
  await resetDatabase(app.db)
  // await testMatches(app)
  // await testQueueTeams(app)
  // await testQueue(app)
  await testMatchScoring(app)
}

async function testQueue(app: App) {
  await addData(app)
  const ranking = (await getRankingInGuildByName(app, '98623457887', 'ranking 1')).ranking

  const player1 = nonNullable(await app.db.players.get('100', ranking.data.id), 'player 100')
  const player2 = nonNullable(await app.db.players.get('200', ranking.data.id), 'player 200')
  const player3 = nonNullable(await app.db.players.get('300', ranking.data.id), 'player 300')

  const team = await app.db.teams.create(ranking, {}, [player1])
  await team.addToQueue()

  await Promise.all([
    new Promise<void>(async resolve => {
      const team = await app.db.teams.create(ranking, {}, [player2])
      await team.addToQueue()
    }),
    new Promise<void>(async resolve => {
      const team = await app.db.teams.create(ranking, {}, [player3])
      await team.addToQueue()
    }),
  ])
}

// async function testMatches(app: App) {
//   await resetDatabase(app.db)
//   await addData(app)

//   const ranking = (await getRankingInGuildByName(app, '98623457887', 'ranking 1')).ranking

//   const player100 = nonNullable(await app.db.players.get('100', ranking.data.id), 'player 100')
//   const player200 = nonNullable(await app.db.players.get('200', ranking.data.id), 'player 200')
//   const player300 = nonNullable(await app.db.players.get('300', ranking.data.id), 'player 300')
//   const player400 = nonNullable(await app.db.players.get('400', ranking.data.id), 'player 400')

//   const match_1_1 = await app.db.matches.create({
//     ranking_id: 1,
//     team_players: [
//       [player100, player200],
//       [player300, player400],
//     ],
//     outcome: [0, 1],
//     time_started: new Date(),
//     time_finished: new Date(),
//   })

//   const match_1_2 = await app.db.matches.create({
//     ranking_id: 2,
//     team_players: [
//       [player100, player200],
//       [player300, player400],
//     ],
//     outcome: [0, 1],
//     time_started: new Date(),
//     time_finished: new Date(),
//   })

//   const match_2_1 = await app.db.matches.create({
//     ranking_id: 1,
//     team_players: [
//       [player100, player200],
//       [player300, player400],
//     ],
//     outcome: [0, 1],
//     time_started: new Date(),
//     time_finished: new Date(),
//   })
// }

async function testQueueTeams(app: App) {
  sentry.debug('resetting database')
  await resetDatabase(app.db)
  sentry.debug('adding data')
  await addData(app)

  const ranking = (await getRankingInGuildByName(app, '98623457887', 'ranking 1')).ranking
  const ranking2 = (await getRankingInGuildByName(app, '98623457887', 'ranking 2')).ranking

  const player100 = nonNullable(await app.db.players.get('100', ranking.data.id), 'player 100')
  const player200 = nonNullable(await app.db.players.get('200', ranking.data.id), 'player 200')
  const player300 = nonNullable(await app.db.players.get('300', ranking.data.id), 'player 300')
  const player400 = nonNullable(await app.db.players.get('400', ranking.data.id), 'player 400')
  const player100_2 = nonNullable(await app.db.players.get('100', ranking2.data.id), 'player 100')
  const player400_2 = nonNullable(await app.db.players.get('400', ranking2.data.id), 'player 400')

  const team_1 = await app.db.teams.create(ranking, {}, [player100, player400])
  await team_1.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1)

  // the same players join the queue for ranking 2
  const team_1_2 = await app.db.teams.create(ranking2, {}, [player100_2, player400_2])
  await team_1_2.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1), team_1_2 (100, 400, ranking 2)

  // user 200 and 300 join the queue for ranking 1
  const team_2 = await app.db.teams.create(ranking, {}, [player200, player300])
  await team_2.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1), team_1_2 (100, 400, ranking 2), team_2 (200, 300, ranking 1)

  // user 100 and 300 join the queue for ranking 1
  const team_3 = await app.db.teams.create(ranking, {}, [player100, player300])
  const queue_team3 = await team_3.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1), team_1_2 (100, 400, ranking 2), team_2 (200, 300, ranking 1), team_3 (100, 300, ranking 1)

  // add to queue again. shouldn't error
  await team_3.addToQueue()

  // get player 100's queue teams. should be team 1 and 3
  const player100_queue_teams = await player100.teams()
  assert(
    player100_queue_teams.filter(t => t.in_queue).length == 2,
    'player 100 should be in queue team 1 and 3',
  )

  // user 100 leaves the queue
  assert(
    (await player300.teams()).filter(t => t.in_queue).length == 2,
    'player 300 should be in queue team 2 and 3',
  )

  await player100.removeTeamsFromQueue()
  // queue teams: team_1_2 (100, 400, ranking 2), team_2 (200, 300, ranking 1)

  assert(
    (await player100.teams()).filter(t => t.in_queue).length == 0,
    'player 200 should not be in queue',
  )
  assert(
    (await player200.teams()).filter(t => t.in_queue).length == 1,
    'player 200 should be in queue team 2',
  )
  assert(
    (await player100_2.teams()).filter(t => t.in_queue).length == 1,
    'player 100 should still be in queue team 1 ranking 2',
  )
}

async function testMatchScoring(app: App) {
  await resetDatabase(app.db)
  sentry.debug('reset database')
  await addData(app)
  sentry.debug('added data')

  const ranking = (await getRankingInGuildByName(app, '98623457887', 'ranking 1')).ranking
  const player100 = await getOrCreatePlayer(app, '100', ranking)
  const player200 = await getOrCreatePlayer(app, '200', ranking)
  const player300 = await getOrCreatePlayer(app, '300', ranking)
  const player400 = await getOrCreatePlayer(app, '400', ranking)

  // const match = await createAndScoreMatch(
  //   app,
  //   ranking,
  //   [
  //     [player100, player200],
  //     [player300, player400],
  //   ],
  //   [0, 1],
  // )

  // await updateMatch(app, match, [1, 0])

  // sentry.debug(player100.data.id, player100.data.rating, player300.data.id, player300.data.rating)
  // sentry.debug(
  //   (await getRegisterPlayer(app, '100', ranking)).data.rating,
  //   (await getRegisterPlayer(app, '300', ranking)).data.rating,
  // )
}

async function getRankingInGuildByName(app: App, guild_id: string, name: string) {
  const rankings = await app.db.guild_rankings.get({ guild_id: guild_id })
  const ranking = rankings.find(r => r.ranking.data.name === name)
  assert(ranking !== undefined, `ranking ${name} should exist`)
  return ranking
}

async function resetDatabase(client: DbClient) {
  await Promise.all([
    client.db.delete(MatchPlayers),
    client.db.delete(MatchSummaryMessages),
    client.db.delete(Matches),
    client.db.delete(QueueTeams),
    client.db.delete(TeamPlayers),
    client.db.delete(GuildRankings),
    client.db.execute(sql`ALTER SEQUENCE "AccessTokens_id_seq" RESTART WITH 1`),
    client.db.delete(AccessTokens),
    client.db.delete(Settings),
  ])
  await Promise.all([
    client.db.execute(sql`ALTER SEQUENCE "Matches_id_seq" RESTART WITH 1`),
    client.db.execute(sql`ALTER SEQUENCE "ActiveMatches_id_seq" RESTART WITH 1`),
    client.db.delete(Teams),
    client.db.delete(Players),
    client.db.delete(Guilds),
  ])
  await Promise.all([
    client.db.execute(sql`ALTER SEQUENCE "Teams_id_seq" RESTART WITH 1`),
    client.db.execute(sql`ALTER SEQUENCE "Players_id_seq" RESTART WITH 1`),
    client.db.delete(Rankings),
    await client.db.delete(Users),
  ])
  await Promise.all([client.db.execute(sql`ALTER SEQUENCE "Rankings_id_seq" RESTART WITH 1`)])
}

async function addData(app: App) {
  const guild1 = await app.db.guilds.create({ id: '98623457887' })
  await Promise.all([
    app.db.users.getOrCreate({ id: '100', name: 'one' }),
    app.db.users.getOrCreate({ id: '200', name: 'two' }),
    app.db.users.getOrCreate({ id: '300', name: 'three' }),
    app.db.users.getOrCreate({ id: '400', name: 'four' }),
  ])

  const ranking1 = await app.db.rankings.create({
    name: 'ranking 1',
    players_per_team: 2,
    num_teams: 2,
    elo_settings: {
      initial_rating: 1000,
      initial_rd: 300,
    },
  })

  const ranking2 = await app.db.rankings.create({
    name: 'ranking 2',
    players_per_team: 2,
    num_teams: 2,
    elo_settings: {
      initial_rating: 1000,
      initial_rd: 300,
    },
  })

  const guild_ranking_1 = await app.db.guild_rankings.create(guild1, ranking1, { is_admin: true })
  const guild_ranking_2 = await app.db.guild_rankings.create(guild1, ranking2, { is_admin: true })

  await Promise.all([
    getOrCreatePlayer(app, { id: '100', global_name: 'p100' } as APIUser, ranking1),
    getOrCreatePlayer(app, { id: '200', global_name: 'p200' } as APIUser, ranking1),
    getOrCreatePlayer(app, { id: '300', global_name: 'p300' } as APIUser, ranking1),
    getOrCreatePlayer(app, { id: '400', global_name: 'p400' } as APIUser, ranking1),
    getOrCreatePlayer(app, { id: '100', global_name: 'p100' } as APIUser, ranking2),
    getOrCreatePlayer(app, { id: '200', global_name: 'p200' } as APIUser, ranking2),
    getOrCreatePlayer(app, { id: '300', global_name: 'p300' } as APIUser, ranking2),
    getOrCreatePlayer(app, { id: '400', global_name: 'p400' } as APIUser, ranking2),
  ])
}

// runTests().then((res) => {
//   process.exit(0)
// })
