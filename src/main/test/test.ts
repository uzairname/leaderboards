import { GuildRankings, Matches, MatchPlayers, Players } from '../../database/schema'
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

  const _ = `
  select * from (
    select id from "Matches" where id in (
      select "Matches".id from "Matches" 
      inner join "MatchPlayers" on "Matches"."id"="match_id"
      inner join "Players" on "MatchPlayers"."player_id"="Players"."id"
      where ...
    )
    order by "time_finished" desc,"time_started" desc
    limit _ offset _
  ) as filtered
  inner join "Matches" on "Matches".id=filtered.id
  inner join "MatchPlayers" on "MatchPlayers".match_id="Matches".id
  inner join "Players" on "Players"."id"="MatchPlayers"."player_id"
  order by "time_finished" asc, "time_started" asc
`

  const filters = {
    finished_on_or_after: undefined,
    status: undefined,
    ranking_ids: undefined,
    player_ids: undefined,
    user_ids: undefined,
    guild_id: undefined,
    limit: 6,
    offset: 0,
  }

  const where_sql_chunks: SQL[] = []

  if (filters.finished_on_or_after) {
    where_sql_chunks.push(gte(Matches.time_finished, filters.finished_on_or_after))
  }

  if (filters.status) {
    where_sql_chunks.push(eq(Matches.status, filters.status))
  }

  if (filters.ranking_ids) {
    where_sql_chunks.push(inArray(Matches.ranking_id, filters.ranking_ids))
  }

  if (filters.player_ids) {
    where_sql_chunks.push(inArray(MatchPlayers.player_id, filters.player_ids))
  }

  if (filters.user_ids) {
    where_sql_chunks.push(inArray(Players.user_id, filters.user_ids))
  }

  if (filters.guild_id) {
    where_sql_chunks.push(eq(GuildRankings.guild_id, filters.guild_id))
  }

  const where_sql = and(...where_sql_chunks)

  const filtered_matches = app.db.drizzle
    .select({ _: Matches.id })
    .from(Matches)
    .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
    .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
    .innerJoin(GuildRankings, eq(Matches.ranking_id, GuildRankings.ranking_id))
    .where(where_sql)
  // .as('filtered')

  const paged_matches = app.db.drizzle
    .select({ id: Matches.id })
    .from(Matches)
    .where(inArray(Matches.id, filtered_matches))
    .orderBy(desc(Matches.time_finished), desc(Matches.time_started))
    .limit(filters.limit ?? -1)
    .offset(filters.offset ?? 0)
    .as('paged')

  const final_query = app.db.drizzle
    .select({ player: Players, match: Matches, match_player: MatchPlayers })
    .from(paged_matches)
    .innerJoin(Matches, eq(Matches.id, paged_matches.id))
    .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
    .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
    .orderBy(asc(Matches.time_finished), asc(Matches.time_started))

  const result = await final_query

  console.log(result, result.length)

  // await testDatabase(app)
  // sentry.debug(`Tested Leaderboards app (${app.config.env.ENVIRONMENT})`)
  return new Response(`Successfully tested Leaderboards app`, { status: 200 })
}

import { and, asc, desc, eq, gte, inArray, SQL } from 'drizzle-orm'
import { Rating, TrueSkill } from 'ts-trueskill'

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
