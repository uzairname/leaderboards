import { MatchOutcome, MatchPlayer, OutcomeType, Rating, RatingParameters } from '@repo/db/models'
import { App } from '../../../../setup/app'
import { BAYESELO_DEFAULT } from '../../../rankings/ratings'
import { posteriorLaplaceApproximation } from '../calculations/calculate-posterior'
import { Scorer } from '../scorer'
import { scoresToZeroHalfOne as outcomeToZeroHalfOne } from '../utils'

export const BayesianScorer: Scorer = {
  /**
   * Bayesian scorer only supports head-to-head (2 teams) matches, and arbitrary players per team.
   */

  score(params: {
    app: App
    outcome: MatchOutcome
    players: MatchPlayer[][]
    time_since_last_match?: number[][]
    best_of?: number
    rating_settings: RatingParameters
  }): Rating[][] {
    const { app, outcome, players, rating_settings } = params

    if (players.length !== 2) {
      throw new Error('Bayesian scorer only supports head-to-head matches')
    }

    // Convert team scores into 1s (win), -1s (loss), or 0 (draw)
    const normalized_team_scores = outcomeToZeroHalfOne(outcome).map(score => score * 2 - 1)

    // Standardize display values to internal values for computation
    // Internal values have a std of 1/200th of the display std, and a mean of 0.
    const convert_mu_to_internal = (mu: number) =>
      (mu - rating_settings.initial_rating.mu) / BAYESELO_DEFAULT.DisplayStddev
    const convert_rd_to_internal = (rd: number) => rd / BAYESELO_DEFAULT.DisplayStddev

    const convert_mu_to_display = (mu: number) =>
      mu * BAYESELO_DEFAULT.DisplayStddev + rating_settings.initial_rating.mu
    const convert_rd_to_display = (rd: number) => rd * BAYESELO_DEFAULT.DisplayStddev

    const new_ratings: Rating[][] = []

    players.forEach((_, team_idx) => {
      new_ratings.push([])

      const team_score = normalized_team_scores[team_idx]

      // Calculate the rating for opponent: average of ratings of all other players
      let other_team_players = players.filter((_, i) => team_idx !== i).flat()

      const sum = other_team_players.reduce((acc, player) => {
        const mu = convert_mu_to_internal(player.rating.mu)
        return acc + mu
      }, 0)

      const opponent_rating = sum / other_team_players.length

      app.logger.debug(`Bayesian scorer: team ${team_idx} score ${team_score}, opponent rating ${opponent_rating}`)

      // Calculate new rating for player
      players[team_idx].forEach(player => {
        const mu = convert_mu_to_internal(player.rating.mu)
        const rd = convert_rd_to_internal(player.rating.rd ?? rating_settings.initial_rating.rd)

        const result = posteriorLaplaceApproximation(
          opponent_rating,
          team_score,
          {
            mean: mu,
            variance: rd ** 2,
          },
          {
            betaZeroGaussianVariance: BAYESELO_DEFAULT.DrawLikelihoodVariance,
          },
        )

        app.logger.debug(
          `Player ${player.player.data.id} posterior: mu ${result.posterior.mean}, rd ${Math.sqrt(result.posterior.variance)}`,
        )

        new_ratings[team_idx].push({
          mu: convert_mu_to_display(result.posterior.mean),
          rd: convert_rd_to_display(Math.sqrt(result.posterior.variance)),
        })
      })
    })

    return new_ratings
  },

  isSupported(outcome_type: OutcomeType, players_per_team: number, teams_per_match: number) {
    if (teams_per_match !== 2) {
      return {
        is_supported: false,
        message: `Bayesian scorer only supports head-to-head matches (2 teams)`,
      }
    }
    return { is_supported: true }
  },
}
