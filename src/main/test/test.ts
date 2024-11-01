import { GuildRankings, Matches, MatchPlayers, Players, Rankings } from '../../database/schema'
import { App } from '../app/App'

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

  app.db.cache.clear()

  await testrescorematches(app)


  return new Response(`Successfully tested Leaderboards app`, { status: 200 })
}


async function testMatchesQuery(app: App) {

  const result = await app.db.matches.getMany({ranking_ids: [13]})

  console.log(result.map(r => [r.match.data.time_finished, r.match.data.time_started]))  
}


async function testrescorematches(app: App) {

  const ranking = await app.db.rankings.get(13)

  console.log(ranking.toString())
  const guild = await app.db.guilds.get('1003698664767762575')

  const first_match = await app.db.matches.getMany({
    ranking_ids: [ranking.data.id],
    earliest_first: true,
    limit: 1,
  })

  console.log(first_match[0].match)

  await rescoreMatches(app, ranking)

  

  // const rankings = await app.db.drizzle.select().from(Rankings)
  // const values = rankings.map(r => [r.id, r.num_teams, r.players_per_team])

  // // unnest the values
  // const num_teams = values.map(v => Math.random() * v[0])
  // const players_per_team = values.map(v => Math.random() * v[1])

  // const ranking_ids = rankings.map(r => r.id)

  // console.log(num_teams)
  // console.log(players_per_team)
  
  // // bulk update the rankings

  // console.log(sql`
  //   UPDATE ${Rankings}
  //   SET num_teams = v.num_teams,
  //       players_per_team = v.players_per_team
  //   FROM (
  //     VALUES (3, 1, 2),
  //             (4, 1, 2)
  //   ) AS v(id, num_teams, players_per_team)
  //   WHERE ${Rankings.id} = v.id
  // `)

  // const match_ids = [2, 2, 3]
  // const player_ids = [5, 6, 8]
  // const rating_before = [30, 25, 28]
  // const rd_before = [15, 10, 13]
  // const flags = [0,1,0]

  // const pg_dialect = new PgDialect()

  // const query = `with values as (
  // SELECT * 
  //   FROM UNNEST(
  //       ARRAY[${match_ids.join(',')}],      
  //       ARRAY[${player_ids.join(',')}],
  //       ARRAY[${rating_before.join(',')}],
  //       ARRAY[${rd_before.join(',')}],
  //       ARRAY[${flags.join(',')}]
  //   ) AS v(a,b,c,d,e)` + pg_dialect.sqlToQuery(sql`
  // )
  // update ${MatchPlayers}
  // set 
  //   rating_before = values.c,
  //   rd_before = values.d,
  //   flags = values.e
  // from values
  // where ${MatchPlayers.match_id} = values.a
  // and ${MatchPlayers.player_id} = values.b
  // `).sql

  // await app.db.drizzle.execute(query)
  
  // console.log(pg_dialect.sqlToQuery(sql`${MatchPlayers.rating_before}`).sql)
  // console.log(query)
  // await testDatabase(app)
  // sentry.debug(`Tested Leaderboards app (${app.config.env.ENVIRONMENT})`)

}



import { and, asc, desc, eq, gte, inArray, sql, SQL } from 'drizzle-orm'
import { Rating, TrueSkill } from 'ts-trueskill'
import { rescoreMatches } from '../bot/modules/matches/management/score-matches'
import { PgDialect } from 'drizzle-orm/pg-core'

function testTs() {
  function getAdjustedBeta(baseBeta: number, best_of: number): number {
    // Reduce the uncertainty for longer series
    return (7 * baseBeta) / best_of
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
