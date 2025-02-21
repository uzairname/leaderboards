import { TrueSkill, Rating as TrueskillRating } from 'ts-trueskill'
import { MatchPlayer, Rating, ScoringMethod } from '@repo/database/models'


const trueskill: Scorer = (
  outcome,
  match_players,
  initial_rating,
  best_of=1,
) => {

  const team_ranks = outcome.map(score => 1 - score)
  
  const env = new TrueSkill(initial_rating.mu, initial_rating.rd)
  
  // Higher beta = more assumed volatility and slower convergence
  // Multiply by 5 to increase assumed volatility
  // Divide by term related to best_of to reduce the uncertainty for longer series
  env.beta =  5 * env.beta / Math.sqrt(best_of)

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

/**
 * Simple scorer that just adds 1 to the winning team and subtracts 1 from the losing team
 * If used for a ranking, a player's total rating = wins - losses
 */
const winsMinusLosses: Scorer = (
  outcome,
  match_players
) => {
  const new_player_ratings = match_players.map((team, i) => {
    return team.map((player, j) => {
      return {
        mu: player.rating.mu + (outcome[i] - 0.5) * 2,
        rd: player.rating.rd,
      }
    })
  })
  return new_player_ratings
}


export function getScorerFn(type: ScoringMethod): Scorer {
  
  const fn = {
    [ScoringMethod.TrueSkill]: trueskill,
    [ScoringMethod.WinsMinusLosses]: winsMinusLosses,
  }[type]

  if (!fn) throw new Error(`Unknown scorer type ${type}`)

  return fn
}
/**
 * Interface for a function that calculates the new ratings of players after a match
 * @param outcome an array of 0s and 1s, where 0 means the team lost and 1 means the team won
 * @param match_players_before contains the ratings of the players before the match
 * @returns 2d array of team player ratings, contains the ratings of the players after the match
 */

export type Scorer = (
  outcome: number[],
  match_players_before: MatchPlayer[][],
  initial_rating: Rating,
  best_of?: number
) => Rating[][];
