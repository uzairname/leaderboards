import { Rating, TrueSkill } from 'ts-trueskill'
import { sentry } from '../../../request/sentry'

export function getNewRatings(
  outcome: number[],
  players: {
    rating: number
    rd: number
  }[][],
  elo_settings: {
    initial_rating?: number
    initial_rd?: number
  }
): Rating[][] {
  const team_ranks = outcome.map(score => 1 - score)

  const env = new TrueSkill(elo_settings.initial_rating, elo_settings.initial_rd)

  sentry.debug(`elo settings ${JSON.stringify(elo_settings)}`)

  let player_ratings = players.map(team => {
    return team.map(player => {
      sentry.debug(`player ${JSON.stringify(player)}`)
      return env.createRating(player.rating ?? undefined, player.rd ?? undefined)
    })
  })

  sentry.debug(`player ratings ${JSON.stringify(player_ratings)}`)

  player_ratings = env.rate(player_ratings, team_ranks)

  sentry.debug(`player ratings after ${JSON.stringify(player_ratings)}`)

  return player_ratings
}
