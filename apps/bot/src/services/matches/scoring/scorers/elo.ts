import { MatchOutcome, MatchPlayer, OutcomeType } from '@repo/db/models'
import { Rating, RatingParameters } from '../../../../../../../packages/db/src/models/rankings'
import { App } from '../../../../setup/app'
import { ELO_DEFAULT } from '../../../rankings/ratings'
import { Scorer } from '../scorer'
import { scoresToZeroHalfOne } from '../utils'

/**
 * Scorer that uses the Elo rating system
 */
export const EloScorer: Scorer = {
  score(params: {
    app: App
    outcome: MatchOutcome
    players: MatchPlayer[][]
    time_since_last_match?: number[][]
    best_of?: number
    rating_settings: RatingParameters
  }): Rating[][] {
    const { outcome, players, rating_settings } = params

    if (players.length !== 2 || players[0].length !== 1 || players[1].length !== 1) {
      throw new Error('Elo scorer only supports 1v1 matches')
    }

    // Normalize team scores to either 0, 0.5, or 1.
    const normalized_team_scores = scoresToZeroHalfOne(outcome)

    const player1 = players[0][0]
    const player2 = players[1][0]

    const expected_score_player1 =
      1 /
      (1 +
        Math.pow(10, (player2.rating.mu - player1.rating.mu) / (rating_settings.initial_rating.rd ?? ELO_DEFAULT.Rd)))
    const expected_score_player2 =
      1 /
      (1 +
        Math.pow(10, (player1.rating.mu - player2.rating.mu) / (rating_settings.initial_rating.rd ?? ELO_DEFAULT.Rd)))
    const k = rating_settings.k_factor ?? ELO_DEFAULT.K // Default K-factor for Elo
    const new_player1_rating = player1.rating.mu + k * (normalized_team_scores[0] - expected_score_player1)
    const new_player2_rating = player2.rating.mu + k * (normalized_team_scores[1] - expected_score_player2)
    return [[{ mu: new_player1_rating, rd: player1.rating.rd }], [{ mu: new_player2_rating, rd: player2.rating.rd }]]
  },

  isSupported(outcome_type: OutcomeType, players_per_team: number, teams_per_match: number) {
    // Elo supports only 1v1 matches
    if (!(players_per_team === 1 && teams_per_match === 2)) {
      return {
        is_supported: false,
        message: `Elo scorer only supports 1v1 matches, got ${players_per_team}v${teams_per_match}`,
      }
    }
    return { is_supported: true }
  },
}
