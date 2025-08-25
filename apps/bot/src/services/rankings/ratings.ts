import { Ranking, Rating, RatingStrategy } from '@repo/db/models'
import type { App } from '../../setup/app'

export const rating_strategy_name = {
  [RatingStrategy.WinsMinusLosses]: `Wins minus losses`,
  [RatingStrategy.TrueSkill]: `TrueSkill2`,
  [RatingStrategy.Elo]: `Elo`,
  [RatingStrategy.Glicko]: `Glicko`,
  [RatingStrategy.Bayesian]: `Bayesian`,
}

// Rating Settings
export const DEFAULT_RATING_STRATEGY = RatingStrategy.Bayesian /**
 * Map a string of an int to a RatingStrategy enum value. Throws an error if invalid.
 */

export function parseRatingStrategy(value: string): RatingStrategy {
  const parsed = parseInt(value)
  if (!Object.values(RatingStrategy).includes(parsed)) throw new Error(`Invalid RatingStratey value: ${value}`)
  return parsed as RatingStrategy
}

// Defaults

export const TRUESKILL_DEFAULT = {
  Mu: 1000,
  Rd: 1000 / 3,
  Tau: 0.5,
}

export const ELO_DEFAULT = {
  K: 32,
  Rd: 400,
  Mu: 1000,
}

export const GLICKO_DEFAULT = {
  Mu: 1000,
  Rd: 350,
  Vol: 0.06,
  Tau: 0.5,
}

export const BAYESELO_DEFAULT = {
  DisplayStddev: 200,
  DrawLikelihoodVariance: 3,
  ProvisionalRdThreshold: 2,
}

/**
 * Returns a function that maps a player's rating to a number to display as their rating.
 * The function offsets the rating by a constant amount of standard deviations if enabled by the rating method.
 * Determines if the rating is provisional.
 */
export function displayRatingFn(
  app: App,
  ranking: Ranking,
): (rating: Rating) => { points: number; is_provisional?: boolean } {
  const props = app.rankings.getProperties(ranking)

  const params = props.rating_params
  return rating => {
    if (params.rating_strategy === RatingStrategy.WinsMinusLosses) {
      return {
        points: rating.mu,
      }
    } else if (params.rating_strategy === RatingStrategy.Elo) {
      return {
        points: Math.round(Math.max(0, rating.mu)),
      }
    } else if (params.rating_strategy === RatingStrategy.TrueSkill) {
      const initial_rd = params.initial_rating.rd
      const player_rd = rating.rd ?? initial_rd

      return {
        points: Math.round(Math.max(0, rating.mu + app.config.DisplaySdOffset * player_rd)),
        is_provisional: player_rd > initial_rd * params.provisional_rd_threshold,
      }
    } else if (params.rating_strategy === RatingStrategy.Glicko) {
      const initial_rd = params.initial_rating.rd
      const player_rd = rating.rd ?? initial_rd

      return {
        points: Math.round(Math.max(0, rating.mu)),
        is_provisional: player_rd > initial_rd * params.provisional_rd_threshold,
      }
    } else if (params.rating_strategy === RatingStrategy.Bayesian) {
      const player_rd = rating.rd ?? params.initial_rating.rd
      return {
        points: Math.round(Math.max(0, rating.mu + app.config.DisplaySdOffset * player_rd)),
        is_provisional: player_rd > params.initial_rating.rd * params.provisional_rd_threshold,
      }
    } else {
      throw new Error(`Don't know how to display rating of type ${params.rating_strategy}`)
    }
  }
}
