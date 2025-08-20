import { Ranking, Rating, RatingSettings, RatingStrategy } from '@repo/db/models'
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
 * Maps rating strategies to their settings. When a ranking is created or updated with
 * a rating method, the settings are filled in with the defaults from this map.
 */

export function getDefaultRatingSettings(strategy: RatingStrategy): RatingSettings {
  const defaults = {
    [RatingStrategy.TrueSkill]: {
      initial_rating: {
        mu: TRUESKILL_DEFAULT.Mu,
        rd: TRUESKILL_DEFAULT.Rd,
      },
      tau: TRUESKILL_DEFAULT.Tau,
    },
    [RatingStrategy.Glicko]: {
      initial_rating: {
        mu: GLICKO_DEFAULT.Mu,
        rd: GLICKO_DEFAULT.Rd,
        vol: GLICKO_DEFAULT.Vol,
      },
      tau: GLICKO_DEFAULT.Tau,
    },
    [RatingStrategy.Elo]: {
      initial_rating: {
        mu: ELO_DEFAULT.Mu,
        rd: ELO_DEFAULT.Rd,
      },
    },
    [RatingStrategy.WinsMinusLosses]: {
      initial_rating: {
        mu: 0,
      },
    },
    [RatingStrategy.Bayesian]: {
      initial_rating: {
        mu: 1000,
        rd: 200,
      },
    },
  }[strategy]

  return {
    rating_strategy: strategy,
    initial_rating: {
      mu: defaults.initial_rating.mu,
      rd: defaults.initial_rating.rd ?? TRUESKILL_DEFAULT.Rd, // TrueSkill default
      vol: defaults.initial_rating.vol ?? GLICKO_DEFAULT.Vol, // Glicko default
    },
    k_factor: ELO_DEFAULT.K,
    tau: defaults.tau ?? GLICKO_DEFAULT.Tau, // Glicko default
  }
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
  const rating_settings = ranking.data.rating_settings
  return rating => {
    if (rating_settings.rating_strategy === RatingStrategy.WinsMinusLosses) {
      return {
        points: rating.mu,
      }
    } else if (rating_settings.rating_strategy === RatingStrategy.Elo) {
      return {
        points: Math.round(Math.max(0, rating.mu)),
      }
    } else if (rating_settings.rating_strategy === RatingStrategy.TrueSkill) {
      const initial_rd = rating_settings.initial_rating.rd ?? TRUESKILL_DEFAULT.Rd
      const player_rd = rating.rd ?? initial_rd

      return {
        points: Math.round(Math.max(0, rating.mu + app.config.DisplaySdOffset * player_rd)),
        is_provisional: player_rd > initial_rd * app.config.TrueSkillProvisionalRdThreshold,
      }
    } else if (rating_settings.rating_strategy === RatingStrategy.Glicko) {
      const initial_rd = rating_settings.initial_rating.rd ?? GLICKO_DEFAULT.Rd
      const player_rd = rating.rd ?? initial_rd

      return {
        points: Math.round(Math.max(0, rating.mu)),
        is_provisional: player_rd > initial_rd * app.config.GlickoProvisionalRdThreshold,
      }
    } else if (rating_settings.rating_strategy === RatingStrategy.Bayesian) {
      const player_rd = rating.rd ?? rating_settings.initial_rating.rd
      return {
        points: Math.round(Math.max(0, rating.mu + app.config.DisplaySdOffset * player_rd)),
        is_provisional: player_rd > rating_settings.initial_rating.rd * BAYESELO_DEFAULT.ProvisionalRdThreshold,
      }
    } else {
      throw new Error(`Don't know how to display rating of type ${rating_settings.rating_strategy}`)
    }
  }
}
