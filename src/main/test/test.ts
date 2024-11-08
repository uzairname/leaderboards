import { App } from '../app/App'

export async function runTests(app: App): Promise<Response> {
  console.log('running tests')

  app.db.cache.clear()

  return new Response(`Successfully tested Leaderboards app`, { status: 200 })
}

async function testlb(app: App) {
  const guild_ranking = app.db.guild_rankings.get('1003698664767762575', 6)
  const player = await app.db.players.fetch(40)

  await setPlayerDisabled(app, player, !(player.data.flags & PlayerFlags.Disabled))
  // await syncGuildRankingLbMessage(app, guild_ranking)
}

async function testrescorematches(app: App) {
  const ranking = app.db.rankings.get(13)
  console.log(`${ranking}`)

  await rescoreMatches(app, ranking, {})
  // const res = await getOrderedLeaderboardPlayers(app, ranking)

  // console.log(res)
  // const guild = app.db.guilds.get('1003698664767762575')
  // console.log(ranking.toString())
}

async function testmatchesquery(app: App) {
  const filters: {
    finished_at_or_after?: Date | null
    status?: MatchStatus
    rankings?: PartialRanking[]
    players?: PartialPlayer[]
    users?: PartialUser[]
    guild?: PartialGuild
    limit?: number
    offset?: number
    earliest_first?: boolean
  } = {}

  const conditions: SQL[] = []

  if (filters.finished_at_or_after) {
    // subtract 1 second to include the matches that finished at the exact time
    const finished_at_or_after = new Date(filters.finished_at_or_after)
    finished_at_or_after.setSeconds(finished_at_or_after.getSeconds() - 1)
    conditions.push(gte(Matches.time_finished, finished_at_or_after))
  }

  if (filters.status) conditions.push(eq(Matches.status, filters.status))

  if (filters.rankings)
    conditions.push(
      inArray(
        Matches.ranking_id,
        filters.rankings.map(r => r.data.id),
      ),
    )

  if (filters.players)
    conditions.push(
      inArray(
        MatchPlayers.player_id,
        filters.players.map(p => p.data.id),
      ),
    )

  if (filters.users)
    conditions.push(
      inArray(
        Players.user_id,
        filters.users.map(u => u.data.id),
      ),
    )

  if (filters.guild) conditions.push(eq(GuildRankings.guild_id, filters.guild.data.id))

  const where_sql = and(...conditions)

  const filtered_matches = app.db.drizzle
    .select({ _: Matches.id })
    .from(Matches)
    .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
    .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
    .innerJoin(GuildRankings, eq(Matches.ranking_id, GuildRankings.ranking_id))
    .where(where_sql)

  const paged_matches = app.db.drizzle
    .select({ id: Matches.id })
    .from(Matches)
    .where(inArray(Matches.id, filtered_matches))
    .orderBy(
      (filters.earliest_first ? asc : desc)(
        sql`coalesce(${Matches.time_finished}, ${Matches.time_started})`,
      ),
    )
    .limit(filters.limit ?? -1)
    .offset(filters.offset ?? 0)
    .as('paged')

  const final_query = app.db.drizzle
    .select({ player: Players, match: Matches, match_player: MatchPlayers })
    .from(paged_matches)
    .innerJoin(Matches, eq(Matches.id, paged_matches.id))
    .innerJoin(MatchPlayers, eq(Matches.id, MatchPlayers.match_id))
    .innerJoin(Players, eq(MatchPlayers.player_id, Players.id))
    .orderBy(asc(sql`coalesce(${Matches.time_finished}, ${Matches.time_started})`))

  const result = await final_query

  console.log(result)
}

import { and, asc, desc, eq, gte, inArray, SQL, sql } from 'drizzle-orm'
import { Rating, TrueSkill } from 'ts-trueskill'
import { PartialGuild } from '../../database/models/guilds'
import { MatchStatus } from '../../database/models/matches'
import { PartialPlayer, PlayerFlags } from '../../database/models/players'
import { PartialRanking } from '../../database/models/rankings'
import { PartialUser } from '../../database/models/users'
import { GuildRankings, Matches, MatchPlayers, Players } from '../../database/schema'
import { rescoreMatches } from '../bot/modules/matches/management/manage-matches'
import { setPlayerDisabled } from '../bot/modules/players/manage-players'

function testTs() {
  function getAdjustedBeta(baseBeta: number, best_of: number): number {
    // Reduce the uncertainty for longer series
    return (7 * baseBeta) / best_of
  }

  const outcome = [0, 1]
  const best_of = 3

  const team_ranks = outcome.map(score => 1 - score)

  const initial_rating = {
    mu: 50,
    rd: 50 / 3,
  }

  const env = new TrueSkill(initial_rating.mu, initial_rating.rd)

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
