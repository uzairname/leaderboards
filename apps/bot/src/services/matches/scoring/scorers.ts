import { MatchPlayer, Rating, RatingSettings, RatingStrategy } from '@repo/db/models'
import { TrueSkill, Rating as TrueskillRating } from 'ts-trueskill'
import { getOutcomeWinners } from '../management/properties'
import { calculateNewGlickoRatings } from './glicko2'

/**
 * Interface for a function that calculates the new ratings of players after a match
 * @param outcome an array of 0s and 1s, where 0 means the team lost and 1 means the team won
 * @param match_players_before contains the ratings of the players before the match
 * @returns 2d array of team player ratings, contains the ratings of the players after the match
 */
export type Scorer = (param: {
  outcome: number[]
  match_players: MatchPlayer[][]
  time_since_last_match?: number[][]
  best_of?: number
  rating_settings: RatingSettings
}) => Rating[][]

export const TRUESKILL_DEFAULT = {
  MU: 1000,
  RD: 1000 / 3,
  TAU: 0.5,
}

const TRUESKILL_INTERNAL = {
  MU: 50,
  RD: 50 / 3,
}

const trueskill: Scorer = ({ outcome, match_players, rating_settings: rs, best_of = 1 }) => {
  const team_ranks = outcome.map(score => 1 - score)

  // The internally used ratio between mu and sigma should match that of rating settings.mu and rd
  const sigma = (TRUESKILL_INTERNAL.MU * rs.initial_rating.rd) / rs.initial_rating.mu
  const env = new TrueSkill(rs.initial_rating.mu, sigma)
  env.tau = rs.tau ?? TRUESKILL_DEFAULT.TAU

  // Higher beta = more assumed volatility and slower convergence
  // Multiply to increase assumed volatility
  // Divide by term related to best_of to reduce the uncertainty for longer series
  env.beta = (3 * env.beta) / Math.sqrt(best_of)

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

export const ELO_DEFAULT_K = 32
export const ELO_DEFAULT_RD = 400
export const ELO_DEFAULT_MU = 1000

/**
 * Scorer that uses the Elo rating system
 * Only works for 1v1 matches
 */
const elo: Scorer = ({ outcome, match_players, rating_settings }) => {
  if (match_players.length !== 2 || match_players[0].length !== 1 || match_players[1].length !== 1) {
    throw new Error('Elo scorer supports 1v1 matches')
  }

  const player1 = match_players[0][0]
  const player2 = match_players[1][0]

  const expected_score_player1 =
    1 /
    (1 + Math.pow(10, (player2.rating.mu - player1.rating.mu) / (rating_settings.initial_rating.rd ?? ELO_DEFAULT_RD)))
  const expected_score_player2 =
    1 /
    (1 + Math.pow(10, (player1.rating.mu - player2.rating.mu) / (rating_settings.initial_rating.rd ?? ELO_DEFAULT_RD)))
  const k = rating_settings.k_factor ?? ELO_DEFAULT_K // Default K-factor for Elo
  const new_player1_rating = player1.rating.mu + k * (outcome[0] - expected_score_player1)
  const new_player2_rating = player2.rating.mu + k * (outcome[1] - expected_score_player2)
  return [[{ mu: new_player1_rating, rd: player1.rating.rd }], [{ mu: new_player2_rating, rd: player2.rating.rd }]]
}

/**
 * Simple scorer that just adds 1 to the winning team and subtracts 1 from the losing team
 * If draw, no change is made
 * If used for a ranking, a player's total rating = wins - losses
 */
const winsMinusLosses: Scorer = ({ outcome, match_players }) => {
  const { winning_team_indices, is_draw } = getOutcomeWinners(outcome)
  if (is_draw) return match_players.map(team => team.map(player => player.rating))

  return match_players.map((team, i) => {
    return team.map(player => {
      return {
        ...player.rating,
        // Add 1 for winning team, subtract 1 for losing team
        mu: player.rating.mu + (winning_team_indices.includes(i) ? 1 : -1),
      }
    })
  })
}

export const GLICKO_DEFAULT_MU = 1000
export const GLICKO_DEFAULT_RD = 350
export const GLICKO_DEFAULT_VOL = 0.06
export const GLICKO_DEFAULT_TAU = 0.5
const GLICKO_SCALE = 173.7178

const glicko2: Scorer = ({ outcome, match_players, rating_settings, time_since_last_match }) => {
  // Ensure this is a 1v1 match
  if (match_players.length !== 2 || match_players[0].length !== 1 || match_players[1].length !== 1) {
    throw new Error('Glicko2 scorer supports only 1v1 matches')
  }

  // Determine number of rating periods since last match for both players
  const p1_inactive_periods = (time_since_last_match?.[0][0] || 0) / (7 * 24 * 60 * 60)
  const p2_inactive_periods = (time_since_last_match?.[1][0] || 0) / (7 * 24 * 60 * 60)

  const new_ratings = calculateNewGlickoRatings(
    {
      rating: match_players[0][0].rating.mu,
      rd: match_players[0][0].rating.rd ?? rating_settings.initial_rating.rd,
      vol: match_players[0][0].rating.vol ?? rating_settings.initial_rating.vol,
    },
    {
      rating: match_players[1][0].rating.mu,
      rd: match_players[1][0].rating.rd ?? rating_settings.initial_rating.rd,
      vol: match_players[1][0].rating.vol ?? rating_settings.initial_rating.vol,
    },
    outcome[0] > outcome[1] ? 1 : outcome[0] < outcome[1] ? 0 : 0.5,
    p1_inactive_periods,
    p2_inactive_periods,
    {
      tau: rating_settings.tau ?? GLICKO_DEFAULT_TAU,
      glicko_scale: GLICKO_SCALE,
      default_rating: rating_settings.initial_rating.mu,
    },
  )

  return [
    [
      {
        mu: new_ratings.player1.rating,
        rd: new_ratings.player1.rd,
        vol: new_ratings.player1.vol,
      },
    ],
    [
      {
        mu: new_ratings.player2.rating,
        rd: new_ratings.player2.rd,
        vol: new_ratings.player2.vol,
      },
    ],
  ]
}

export function getScorerFn(type: RatingStrategy): Scorer {
  const fn = {
    [RatingStrategy.TrueSkill]: trueskill,
    [RatingStrategy.WinsMinusLosses]: winsMinusLosses,
    [RatingStrategy.Elo]: elo,
    [RatingStrategy.Glicko]: glicko2,
  }[type]

  if (!fn) throw new Error(`Unknown rating method ${type}`)

  return fn
}
