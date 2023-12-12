import { Match, Player, Ranking } from '../../database/models'
import { sentry } from '../../request/sentry'
import { assertValue } from '../../utils/utils'
import { Rating, TrueSkill } from 'ts-trueskill'

export function scoreMatch(
  outcome: number[],
  players: {
    rating: number
    rd: number
  }[][],
  ranking: Ranking,
): Rating[][] {
  assertValue(ranking.data.elo_settings)

  const team_ranks = outcome.map((score) => 1 - score)

  const env = new TrueSkill(
    ranking.data.elo_settings.initial_rating,
    ranking.data.elo_settings.initial_rd,
  )

  sentry.debug(`elo settings ${JSON.stringify(ranking.data.elo_settings)}`)

  let player_ratings = players.map((team) => {
    return team.map((player) => {
      return env.createRating(player.rating ?? undefined, player.rd ?? undefined)
    })
  })

  sentry.debug(`player ratings ${JSON.stringify(player_ratings)}`)

  player_ratings = env.rate(player_ratings, team_ranks)

  sentry.debug(`player ratings after ${JSON.stringify(player_ratings)}`)

  return player_ratings
}

export async function scoreRankingHistory(ranking: Ranking) {
  /*
    update all players' score based on match history
    */

  const matches = await ranking.latestMatches()

  const team_history = matches.map((match) => {
    return match.data.team_players
  })

  const outcome_history = matches.map((match) => {
    return match.data.outcome
  })
}
