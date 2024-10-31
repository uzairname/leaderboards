import { Rating, TrueSkill } from 'ts-trueskill'
import { EloSettings } from '../../../../../database/models/rankings'

function getAdjustedBeta(baseBeta: number, best_of: number): number {
  // Higher beta = more assumed volatility and slower convergence
  // Multiply by 5 to increase overall volatility
  // Divide to reduce the uncertainty for longer series
  return (5 * baseBeta) / Math.sqrt(best_of)
}

export function rateTrueskill(
  outcome: number[],
  players: {
    rating_before: number
    rd_before: number
  }[][],
  elo_settings: EloSettings,
  best_of?: number,
): {
  new_rating: number
  new_rd: number
}[][] {
  // outcome is an array of 0s and 1s, where 0 means the team lost and 1 means the team won
  const team_ranks = outcome.map(score => 1 - score)

  const env = new TrueSkill(elo_settings.initial_rating, elo_settings.initial_rd)

  env.beta = getAdjustedBeta(env.beta, best_of ?? 1)

  const old_player_ratings = players.map(team => {
    return team.map(player => {
      return env.createRating(player.rating_before ?? undefined, player.rd_before ?? undefined)
    })
  })

  const new_player_ratings: Rating[][] = env.rate(old_player_ratings, team_ranks)

  return new_player_ratings.map(team => {
    return team.map(player => {
      return {
        new_rating: player.mu,
        new_rd: player.sigma,
      }
    })
  })
}

/**
 * Returns the new ratings for each player in a match according to elo settings,
 * the players' ratings before the match, and the match outcome.
 */
