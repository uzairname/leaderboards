import { TrueSkill, Rating as TrueskillRating } from 'ts-trueskill'
import { MatchPlayer } from 'database/models/matches'
import { Rating } from 'database/models/rankings'

function getAdjustedBeta(baseBeta: number, best_of: number): number {
  // Higher beta = more assumed volatility and slower convergence
  // Multiply by 5 to increase assumed volatility
  // Divide to reduce the uncertainty for longer series
  return (5 * baseBeta) / Math.sqrt(best_of)
}

/**
 *
 * @param outcome an array of 0s and 1s, where 0 means the team lost and 1 means the team won
 * @param match_players_before contains the ratings of the players before the match
 * @returns Match players. contains the ratings of the players after the match
 */
export type Scorer = (
  outcome: number[],
  match_players_before: MatchPlayer[][],
  initial_rating: Rating,
  best_of?: number,
) => Rating[][]

export const rateTrueskill: Scorer = (
  outcome,
  match_players,
  initial_rating,
  best_of,
): Rating[][] => {
  const team_ranks = outcome.map(score => 1 - score)

  const env = new TrueSkill(initial_rating.mu, initial_rating.rd)

  env.beta = getAdjustedBeta(env.beta, best_of ?? 1)

  const old_player_ratings = match_players.map(team => {
    return team.map(player => {
      return env.createRating(player.rating.mu ?? undefined, player.rating.rd ?? undefined)
    })
  })

  const new_player_ratings: TrueskillRating[][] = env.rate(old_player_ratings, team_ranks)

  return new_player_ratings.map((team, i) => {
    return team.map((player, i) => {
      return {
        mu: player.mu,
        rd: player.sigma,
        vol: match_players[i][i].rating.vol,
      }
    })
  })
}

export const simpleScorer: Scorer = (
  outcome,
  match_players,
  initial_rating,
  best_of,
): Rating[][] => {
  const new_player_ratings = match_players.map((team, i) => {
    return team.map((player, j) => {
      return {
        mu: player.rating.mu + (outcome[i] - 0.5) * 2,
        rd: player.rating.rd,
      }
    })
  })
  console.log(match_players.map(team => team.map(player => player.rating.mu)).flat())
  console.log(outcome)
  console.log(new_player_ratings.map(team => team.map(player => player.mu)).flat())
  console.log('a')
  return new_player_ratings
}
